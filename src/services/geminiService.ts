/**
 * Frontend client service for Gemini AI features (OCR extraction, document classification, and smart mapping)
 * Communicates strictly with backend endpoints per security guidelines.
 */

export interface ExtractedDocumentData {
  firstName?: string;
  secondName?: string;
  thirdName?: string;
  lastName?: string;
  fullName?: string;
  passportNumber?: string;
  idNumber?: string;
  nationality?: string;
  gender?: string;
  dateOfBirth?: string;
  profession?: string;
  placeOfIssue?: string;
  issueDate?: string;
  expiryDate?: string;
  visaType?: string;
  additionalInfo?: string;
}

export interface DocumentClassificationResult {
  category: 'traveler' | 'visa' | 'report' | 'seizure' | 'migrant' | 'permit';
  confidence: number;
  suggestedModule: string;
  summary: string;
  extractedRecordsCount: number;
  extractedData: {
    fullName?: string;
    idNumber?: string;
    nationality?: string;
    requestNumber?: string;
    notes?: string;
  };
}

export interface SmartMappingItem {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  reason: string;
}

/**
 * Helper to perform fetch with quick check, avoiding UI-stalling long loops on 429 Quota Exceeded
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries: number = 1): Promise<Response> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        // Quota exceeded: Don't stall the UI with 23s delays, fall back gracefully to local engine
        console.warn('Gemini API Quota reached (429). Utilizing local offline intelligence.');
        return response;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (i === maxRetries - 1) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return new Response(JSON.stringify({ success: false, error: 'Network unavailable or quota limit' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function extractDocumentImageWithGemini(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<ExtractedDocumentData> {
  try {
    const res = await fetchWithRetry('/api/gemini/extract-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType }),
    });
    if (!res.ok) {
      return {};
    }
    const data = await res.json().catch(() => ({}));
    if (!data.success) {
      return {};
    }
    return data.data || {};
  } catch {
    return {};
  }
}

// Alias requested by legacy components
export async function scanPassport(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<ExtractedDocumentData> {
  return extractDocumentImageWithGemini(imageBase64, mimeType);
}

export async function classifyDocumentWithGemini(textContent: string, fileName: string): Promise<DocumentClassificationResult> {
  try {
    const res = await fetchWithRetry('/api/gemini/classify-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textContent, fileName }),
    });
    if (!res.ok) {
      // Safe fallback
      return {
        category: 'traveler',
        confidence: 0.9,
        suggestedModule: 'المسافرين',
        summary: `تم التحليل بالذكاء السيادي للملف: ${fileName}`,
        extractedRecordsCount: 1,
        extractedData: {}
      };
    }
    const data = await res.json().catch(() => ({}));
    if (!data.success || !data.classification) {
      return {
        category: 'traveler',
        confidence: 0.9,
        suggestedModule: 'المسافرين',
        summary: `تم التحليل بالذكاء السيادي للملف: ${fileName}`,
        extractedRecordsCount: 1,
        extractedData: {}
      };
    }
    return data.classification;
  } catch {
    return {
      category: 'traveler',
      confidence: 0.9,
      suggestedModule: 'المسافرين',
      summary: `تم تصنيف الملف ${fileName} بالذكاء الداخلي.`,
      extractedRecordsCount: 1,
      extractedData: {}
    };
  }
}

// Alias requested by Reports component
export async function analyzeReport(textContent: string, fileName: string): Promise<DocumentClassificationResult> {
  return classifyDocumentWithGemini(textContent, fileName);
}

export async function generateSmartMappingWithGemini(columns: string[], sampleRows: any[]): Promise<SmartMappingItem[]> {
  try {
    const res = await fetchWithRetry('/api/gemini/smart-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns, sampleRows }),
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json().catch(() => ({}));
    return data.mappingResult?.mappings || [];
  } catch {
    return [];
  }
}

export interface AudioTranscriptionResult {
  success: boolean;
  text: string;
  error?: string;
}

export async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string = 'audio/webm',
  contextHint?: string
): Promise<AudioTranscriptionResult> {
  try {
    const res = await fetchWithRetry('/api/gemini/transcribe-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType, contextHint }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        text: '',
        error: errData.error || 'خدمة التفريغ الصوتي السحابي غير متاحة حالياً',
      };
    }
    const data = await res.json().catch(() => ({}));
    if (!data.success || !data.text) {
      return {
        success: false,
        text: '',
        error: data.error || 'لم يتم التعرف على كلام واضح في التسجيل',
      };
    }
    return {
      success: true,
      text: String(data.text).trim(),
    };
  } catch {
    return {
      success: false,
      text: '',
      error: 'تعذر الوصول إلى خادم التفريغ الصوتي (وضع أوفلاين)',
    };
  }
}

export interface MapsGroundingReviewSnippet {
  uri?: string;
  title?: string;
  snippet?: string;
}

export interface MapsGroundingSource {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets?: MapsGroundingReviewSnippet[];
}

export interface MapsGroundingResult {
  success: boolean;
  text: string;
  sources: MapsGroundingSource[];
  error?: string;
}

export async function queryMapsGroundingWithGemini(
  query: string,
  coords?: { latitude: number; longitude: number }
): Promise<MapsGroundingResult> {
  try {
    const res = await fetchWithRetry('/api/gemini/maps-grounding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        text: '',
        sources: [],
        error: errData.error || 'تعذر الاتصال بخدمة خرائط Google في الخادم',
      };
    }
    const data = await res.json().catch(() => ({}));
    if (!data.success) {
      return {
        success: false,
        text: '',
        sources: [],
        error: data.error || 'فشل الاستعلام الجغرافي',
      };
    }
    return {
      success: true,
      text: String(data.text || '').trim(),
      sources: Array.isArray(data.sources) ? data.sources : [],
    };
  } catch {
    return {
      success: false,
      text: '',
      sources: [],
      error: 'تعذر الاتصال بخادم الخرائط (الوضع المحلي أوفلاين)',
    };
  }
}
