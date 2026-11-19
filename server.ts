import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

const app = express();
app.use(express.json({ limit: '50mb' }));

// Lazy-initialize GoogleGenAI server-side client so dev server starts cleanly even if GEMINI_API_KEY is not yet set
let cachedAiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!cachedAiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAiClient;
}

async function callGeminiWithRetry(params: Parameters<GoogleGenAI['models']['generateContent']>[0], maxAttempts = 3) {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getAiClient().models.generateContent(params);
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || '');
      const status = err?.status || (msg.includes('503') ? 503 : msg.includes('429') ? 429 : 500);
      const isTransient = status === 503 || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('temporarily');
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: process.env.NODE_ENV || 'development' });
});

// 1. OCR Extraction Endpoint for Passport & Document Images
app.post('/api/gemini/extract-image', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

    const response = await callGeminiWithRetry({
      model: 'gemini-4-hydrogen',
      contents: [
        {
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        },
        {
          text: `اقرأ هذه الصورة لوثيقة سفر أو جواز سفر (يمني أو عربي أو أجنبي) بدقة تامة. استخرج الاسم العربي الكامل (بدمج حقل الاسم + حقل اللقب إن وُجدا منفصلين)، والاسم الإنجليزي، ورقم الجواز، والجنسية، وتاريخ الميلاد، وتاريخ الإصدار، وتاريخ الانتهاء بصيغة YYYY-MM-DD، ومحل الميلاد، وجهة الإصدار، والمهنة، والجنس.`,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            firstName: { type: Type.STRING },
            secondName: { type: Type.STRING },
            thirdName: { type: Type.STRING },
            fourthName: { type: Type.STRING },
            lastName: { type: Type.STRING },
            fullName: { type: Type.STRING },
            passportName: { type: Type.STRING },
            passportNumber: { type: Type.STRING },
            idNumber: { type: Type.STRING },
            nationality: { type: Type.STRING },
            gender: { type: Type.STRING },
            dateOfBirth: { type: Type.STRING },
            governorate: { type: Type.STRING },
            profession: { type: Type.STRING },
            placeOfIssue: { type: Type.STRING },
            issueDate: { type: Type.STRING },
            expiryDate: { type: Type.STRING },
            visaType: { type: Type.STRING },
            additionalInfo: { type: Type.STRING },
          },
        },
      },
    });

    const jsonText = response.text || '{}';
    const parsed = JSON.parse(jsonText);
    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Gemini OCR Error:', error);
    const msg = String(error?.message || '');
    const status = msg.includes('429') || error.status === 429 ? 429 : (msg.includes('503') || error.status === 503 ? 503 : 500);
    res.status(status).json({ success: false, error: msg || 'Failed to extract text from image' });
  }
});

// 1b. Advanced Sovereign Document Image Analyzer Endpoint (Passport vs Seizure Memo)
app.post('/api/gemini/analyze-document-image', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const prompt = `أنت خبير في قراءة وتحليل وثائق السفر والهويات ومحاضر الضبط الأمنية اليمنية والعربية والأجنبية.
حلل هذه الصورة بدقة تامة واستخرج كل البيانات المطبوعة باللغتين العربية والإنجليزية ومن سطر الـ MRZ أسفل الجواز إن وُجد:
1. حدد docType: ("passport" لجواز السفر، "seizure_memo" لمحضر ضبط جوازات، "visa" لتأشيرة/إقامة، "id_card" لبطاقة هوية).
2. إذا كانت جواز سفر (خصوصاً الجواز اليمني الذي يحتوي خانة "الاسم" وخانة "اللقب" منفصلتين):
   - ادمج الاسم واللقب في fullNameArabic (مثال: حمزه عبدالله علي الرضي)، واجعل lastName هو اللقب (مثال: الرضي)، ووزّع باقي الأجزاء في firstName و secondName و thirdName و fourthName.
   - اجمع الاسم الإنجليزي الكامل (GIVEN NAMES + SURNAME) في fullNameEnglish.
   - استخرج idNumber / passportNumber بدون مسافات (مثال: 17640497).
   - استخرج country بالعربية (لليمن: "اليمن").
   - حوّل جميع التواريخ (birthDate, issueDate, expiryDate) إلى صيغة YYYY-MM-DD بدقة.
   - استخرج governorate (محل الميلاد مثل: المحويت أو الأمانة/صنعاء)، و placeOfIssue (جهة الإصدار مثل: تعز)، و profession (المهنة بالعربية مثل: عامل)، و gender ("ذكر" أو "أنثى").
   - حدد suggestedDepartment: للجواز اليمني اختر "travelers"، وللأجنبي اختر "foreigners".
3. إذا كانت محضر ضبط أمني: املأ كائن seizureData كاملاً بجميع الجوازات وأرقامها وأسماء أصحابها.`;

    const response = await callGeminiWithRetry({
      model: 'gemini-4-hydrogen',
      contents: [
        { inlineData: { data: cleanBase64, mimeType: mimeType || 'image/jpeg' } },
        { text: prompt }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            docType: { type: Type.STRING },
            suggestedDepartment: { type: Type.STRING },
            fullNameArabic: { type: Type.STRING },
            firstName: { type: Type.STRING },
            secondName: { type: Type.STRING },
            thirdName: { type: Type.STRING },
            fourthName: { type: Type.STRING },
            lastName: { type: Type.STRING },
            fullNameEnglish: { type: Type.STRING },
            idNumber: { type: Type.STRING },
            passportNumber: { type: Type.STRING },
            country: { type: Type.STRING },
            governorate: { type: Type.STRING },
            placeOfBirth: { type: Type.STRING },
            placeOfIssue: { type: Type.STRING },
            birthDate: { type: Type.STRING },
            issueDate: { type: Type.STRING },
            expiryDate: { type: Type.STRING },
            age: { type: Type.INTEGER },
            gender: { type: Type.STRING },
            profession: { type: Type.STRING },
            destination: { type: Type.STRING },
            visitReason: { type: Type.STRING },
            visaType: { type: Type.STRING },
            mrzText: { type: Type.STRING },
            seizureData: {
              type: Type.OBJECT,
              properties: {
                recordNumber: { type: Type.STRING },
                seizurePort: { type: Type.STRING },
                seizureDate: { type: Type.STRING },
                driverName: { type: Type.STRING },
                carPlate: { type: Type.STRING },
                direction: { type: Type.STRING },
                reason: { type: Type.STRING },
                passports: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      travelerName: { type: Type.STRING },
                      passportNumber: { type: Type.STRING },
                      nationality: { type: Type.STRING },
                      issueDate: { type: Type.STRING },
                      issueGovernorate: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        },
      }
    });

    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText);
    res.json({ success: true, parsed, rawText });
  } catch (error: any) {
    console.error('Gemini Document Image Analysis Error:', error);
    const msg = String(error?.message || '');
    const status = msg.includes('429') || error.status === 429 ? 429 : (msg.includes('503') || error.status === 503 ? 503 : 500);
    res.status(status).json({ success: false, error: msg || 'Failed to analyze document image' });
  }
});

// 2. Document Classifier Endpoint
app.post('/api/gemini/classify-document', async (req, res) => {
  try {
    const { textContent, fileName } = req.body;
    if (!textContent && !fileName) {
      return res.status(400).json({ error: 'No content or filename provided' });
    }

    const response = await getAiClient().models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `قم بتحليل نص أو اسم المستند الآتي (اسم الملف: ${fileName || 'غير معروف'}):
      ---
      ${textContent || ''}
      ---
      قم بتصنيف المستند بدقة وإرجاع النتيجة بصيغة JSON فقط:
      {
        "category": "traveler" | "visa" | "report" | "seizure" | "migrant" | "permit",
        "confidence": 0.95,
        "suggestedModule": "اسم القسم المقترح في النظام (مسافرين، مذكرات الخارجية، المضبوطات، الهجرة، التصاريح)",
        "summary": "ملخص قصير لمحتوى الوثيقة",
        "extractedRecordsCount": 1,
        "extractedData": {
          "fullName": "",
          "idNumber": "",
          "nationality": "",
          "requestNumber": "",
          "notes": ""
        }
      }`,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, classification: parsed });
  } catch (error: any) {
    console.error('Gemini Classification Error:', error);
    const status = error.message?.includes('429') || error.status === 429 ? 429 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to classify document' });
  }
});

// 3. Smart Mapping Endpoint for Excel / PDF tables
app.post('/api/gemini/smart-mapping', async (req, res) => {
  try {
    const { columns, sampleRows } = req.body;
    if (!columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: 'Columns array is required' });
    }

    const response = await getAiClient().models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `لديك أعمدة ملف مستورد (إكسل أو كشف PDF) لقسم جوازات ومنافذ حدودية:
      الأعمدة: ${JSON.stringify(columns)}
      عينات من البيانات: ${JSON.stringify(sampleRows || [])}
      
      قائمة حقول قاعدة البيانات المتاحة في النظام:
      - firstName (الاسم الأول)
      - lastName (اسم العائلة/اللقب)
      - fullName (الاسم الكامل)
      - idNumber (رقم الجواز أو الهوية)
      - nationality (الجنسية)
      - profession (المهنة)
      - birthDate (تاريخ الميلاد)
      - gender (الجنس)
      - issueDate (تاريخ الإصدار)
      - expiryDate (تاريخ الانتهاء)
      - organization (الجهة / المنظمة)
      - visaType (نوع التأشيرة)
      - workLocation (مكان العمل)
      - additionalInfo (معلومات إضافية)

      اقترح لكل عمود من أعمدة الملف ما يناسبه من حقول قاعدة البيانات. أرجع النتيجة بصيغة JSON فقط كالتالي:
      {
        "mappings": [
          { "sourceColumn": "اسم العمود الأصلي", "targetField": "اسم الحقل المقترح في قاعدة البيانات", "confidence": 0.98, "reason": "سبب المطابقة" }
        ]
      }`,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, mappingResult: parsed });
  } catch (error: any) {
    console.error('Smart Mapping Error:', error);
    const status = error.message?.includes('429') || error.status === 429 ? 429 : 500;
    res.status(status).json({ 
      success: false, 
      error: error.message || 'Failed to generate smart mapping',
      details: error.details || []
    });
  }
});

// 4. Audio Transcription Endpoint (gemini-3.5-transcribe)
app.post('/api/gemini/transcribe-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType, contextHint } = req.body;
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'No audio data provided' });
    }

    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9.+-]+(?:;[^,]*)?,/, '');
    const normalizedMimeType = (typeof mimeType === 'string' && mimeType.split(';')[0].trim()) || 'audio/webm';

    const audioPart = {
      inlineData: {
        mimeType: normalizedMimeType,
        data: cleanBase64,
      },
    };

    const instruction = contextHint
      ? `قم بتفريغ هذا التسجيل الصوتي بدقة إلى نص عربي فصيح واضح ومباشر مناسب لسجلات الجوازات والمنافذ الأمنية (السياق: ${contextHint}). حافظ على دقة الأسماء وأرقام الجوازات واللوحات والتواريخ كما نُطقت. أعد النص المفرغ فقط دون أي مقدمات أو شروحات.`
      : 'قم بتفريغ هذا التسجيل الصوتي بدقة إلى نص عربي واضح ومباشر، مع الحفاظ على دقة الأسماء والأرقام كما نُطقت. أعد النص المفرغ فقط دون أي إضافات.';

    const response = await getAiClient().models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: { parts: [audioPart, { text: instruction }] },
    });

    const text = (response.text || '').trim();
    res.json({ success: true, text });
  } catch (error: any) {
    console.error('Gemini Audio Transcription Error:', error);
    const status = error.message?.includes('429') || error.status === 429 ? 429 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to transcribe audio',
    });
  }
});

// 5. Google Maps Grounding Endpoint (gemini-4-hydrogen + googleMaps tool)
app.post('/api/gemini/maps-grounding', async (req, res) => {
  try {
    const { query, latitude, longitude } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const hasValidCoords =
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude);

    const config: any = {
      tools: [{ googleMaps: {} }],
    };

    if (hasValidCoords) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude,
            longitude,
          },
        },
      };
    }

    const prompt = `أجب باللغة العربية بشكل منظم ومفيد لضباط المنافذ والجوازات وتصاريح التنقل في الجمهورية اليمنية عن الاستعلام الجغرافي التالي، مع توضيح المدن والمحافظات والمسافات والمعالم الرئيسية والنقاط المتاحة:
${query.trim()}`;

    const response = await getAiClient().models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config,
    });

    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const mapSources = rawChunks
      .map((chunk: any) => {
        if (!chunk?.maps) return null;
        const reviewSnippets = Array.isArray(chunk.maps.placeAnswerSources?.reviewSnippets)
          ? chunk.maps.placeAnswerSources.reviewSnippets
              .map((s: any) => ({
                uri: s?.uri || '',
                title: s?.title || '',
                snippet: s?.snippet || '',
              }))
              .filter((s: any) => s.uri || s.snippet)
          : [];
        return {
          title: chunk.maps.title || 'موقع على خرائط Google',
          uri: chunk.maps.uri || '',
          placeId: chunk.maps.placeId || '',
          reviewSnippets,
        };
      })
      .filter((item: any) => item && (item.uri || item.title));

    res.json({
      success: true,
      text: (response.text || '').trim(),
      sources: mapSources,
    });
  } catch (error: any) {
    console.error('Gemini Maps Grounding Error:', error);
    const status = error.message?.includes('429') || error.status === 429 ? 429 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to query Google Maps grounding',
    });
  }
});

function resolveListenPort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT || 8080);
  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT || 3000);
  if (process.env.NODE_ENV !== 'production' && envPort === nginxPort) {
    return defaultAppPort;
  }
  return Number.isFinite(envPort) && envPort > 0 ? envPort : defaultAppPort;
}

async function startServer() {
  const PORT = resolveListenPort();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err) => {
    console.error(`Failed to bind server on 0.0.0.0:${PORT}:`, err);
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error('Fatal error during server startup:', err);
  process.exit(1);
});
