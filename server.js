// server.ts
import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import path from "path";
dotenv.config();
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
var app = express();
app.use(express.json({ limit: "50mb" }));
var cachedAiClient = null;
function getAiClient() {
  if (!cachedAiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return cachedAiClient;
}
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: process.env.NODE_ENV || "development" });
});
app.post("/api/gemini/extract-image", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "No image data provided" });
    }
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const response = await getAiClient().models.generateContent({
      model: "gemini-4-hydrogen",
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: cleanBase64
          }
        },
        {
          text: `\u0627\u0642\u0631\u0623 \u0647\u0630\u0647 \u0627\u0644\u0635\u0648\u0631\u0629 \u0644\u0648\u062B\u064A\u0642\u0629 \u0633\u0641\u0631 \u0623\u0648 \u062C\u0648\u0627\u0632 \u0633\u0641\u0631 (\u064A\u0645\u0646\u064A \u0623\u0648 \u0639\u0631\u0628\u064A \u0623\u0648 \u0623\u062C\u0646\u0628\u064A) \u0628\u062F\u0642\u0629 \u062A\u0627\u0645\u0629. \u0627\u0633\u062A\u062E\u0631\u062C \u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0639\u0631\u0628\u064A \u0627\u0644\u0643\u0627\u0645\u0644 (\u0628\u062F\u0645\u062C \u062D\u0642\u0644 \u0627\u0644\u0627\u0633\u0645 + \u062D\u0642\u0644 \u0627\u0644\u0644\u0642\u0628 \u0625\u0646 \u0648\u064F\u062C\u062F\u0627 \u0645\u0646\u0641\u0635\u0644\u064A\u0646)\u060C \u0648\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u060C \u0648\u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0632\u060C \u0648\u0627\u0644\u062C\u0646\u0633\u064A\u0629\u060C \u0648\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u064A\u0644\u0627\u062F\u060C \u0648\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0635\u062F\u0627\u0631\u060C \u0648\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621 \u0628\u0635\u064A\u063A\u0629 YYYY-MM-DD\u060C \u0648\u0645\u062D\u0644 \u0627\u0644\u0645\u064A\u0644\u0627\u062F\u060C \u0648\u062C\u0647\u0629 \u0627\u0644\u0625\u0635\u062F\u0627\u0631\u060C \u0648\u0627\u0644\u0645\u0647\u0646\u0629\u060C \u0648\u0627\u0644\u062C\u0646\u0633.`
        }
      ],
      config: {
        responseMimeType: "application/json",
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
            additionalInfo: { type: Type.STRING }
          }
        }
      }
    });
    const jsonText = response.text || "{}";
    const parsed = JSON.parse(jsonText);
    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    const status = error.message?.includes("429") || error.status === 429 ? 429 : 500;
    res.status(status).json({ success: false, error: error.message || "Failed to extract text from image" });
  }
});
app.post("/api/gemini/analyze-document-image", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: "No image data provided" });
    }
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const prompt = `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u0641\u064A \u0642\u0631\u0627\u0621\u0629 \u0648\u062A\u062D\u0644\u064A\u0644 \u0648\u062B\u0627\u0626\u0642 \u0627\u0644\u0633\u0641\u0631 \u0648\u0627\u0644\u0647\u0648\u064A\u0627\u062A \u0648\u0645\u062D\u0627\u0636\u0631 \u0627\u0644\u0636\u0628\u0637 \u0627\u0644\u0623\u0645\u0646\u064A\u0629 \u0627\u0644\u064A\u0645\u0646\u064A\u0629 \u0648\u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0648\u0627\u0644\u0623\u062C\u0646\u0628\u064A\u0629.
\u062D\u0644\u0644 \u0647\u0630\u0647 \u0627\u0644\u0635\u0648\u0631\u0629 \u0628\u062F\u0642\u0629 \u062A\u0627\u0645\u0629 \u0648\u0627\u0633\u062A\u062E\u0631\u062C \u0643\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0637\u0628\u0648\u0639\u0629 \u0628\u0627\u0644\u0644\u063A\u062A\u064A\u0646 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0648\u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629 \u0648\u0645\u0646 \u0633\u0637\u0631 \u0627\u0644\u0640 MRZ \u0623\u0633\u0641\u0644 \u0627\u0644\u062C\u0648\u0627\u0632 \u0625\u0646 \u0648\u064F\u062C\u062F:
1. \u062D\u062F\u062F docType: ("passport" \u0644\u062C\u0648\u0627\u0632 \u0627\u0644\u0633\u0641\u0631\u060C "seizure_memo" \u0644\u0645\u062D\u0636\u0631 \u0636\u0628\u0637 \u062C\u0648\u0627\u0632\u0627\u062A\u060C "visa" \u0644\u062A\u0623\u0634\u064A\u0631\u0629/\u0625\u0642\u0627\u0645\u0629\u060C "id_card" \u0644\u0628\u0637\u0627\u0642\u0629 \u0647\u0648\u064A\u0629).
2. \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u062C\u0648\u0627\u0632 \u0633\u0641\u0631 (\u062E\u0635\u0648\u0635\u0627\u064B \u0627\u0644\u062C\u0648\u0627\u0632 \u0627\u0644\u064A\u0645\u0646\u064A \u0627\u0644\u0630\u064A \u064A\u062D\u062A\u0648\u064A \u062E\u0627\u0646\u0629 "\u0627\u0644\u0627\u0633\u0645" \u0648\u062E\u0627\u0646\u0629 "\u0627\u0644\u0644\u0642\u0628" \u0645\u0646\u0641\u0635\u0644\u062A\u064A\u0646):
   - \u0627\u062F\u0645\u062C \u0627\u0644\u0627\u0633\u0645 \u0648\u0627\u0644\u0644\u0642\u0628 \u0641\u064A fullNameArabic (\u0645\u062B\u0627\u0644: \u062D\u0645\u0632\u0647 \u0639\u0628\u062F\u0627\u0644\u0644\u0647 \u0639\u0644\u064A \u0627\u0644\u0631\u0636\u064A)\u060C \u0648\u0627\u062C\u0639\u0644 lastName \u0647\u0648 \u0627\u0644\u0644\u0642\u0628 (\u0645\u062B\u0627\u0644: \u0627\u0644\u0631\u0636\u064A)\u060C \u0648\u0648\u0632\u0651\u0639 \u0628\u0627\u0642\u064A \u0627\u0644\u0623\u062C\u0632\u0627\u0621 \u0641\u064A firstName \u0648 secondName \u0648 thirdName \u0648 fourthName.
   - \u0627\u062C\u0645\u0639 \u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A \u0627\u0644\u0643\u0627\u0645\u0644 (GIVEN NAMES + SURNAME) \u0641\u064A fullNameEnglish.
   - \u0627\u0633\u062A\u062E\u0631\u062C idNumber / passportNumber \u0628\u062F\u0648\u0646 \u0645\u0633\u0627\u0641\u0627\u062A (\u0645\u062B\u0627\u0644: 17640497).
   - \u0627\u0633\u062A\u062E\u0631\u062C country \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 (\u0644\u0644\u064A\u0645\u0646: "\u0627\u0644\u064A\u0645\u0646").
   - \u062D\u0648\u0651\u0644 \u062C\u0645\u064A\u0639 \u0627\u0644\u062A\u0648\u0627\u0631\u064A\u062E (birthDate, issueDate, expiryDate) \u0625\u0644\u0649 \u0635\u064A\u063A\u0629 YYYY-MM-DD \u0628\u062F\u0642\u0629.
   - \u0627\u0633\u062A\u062E\u0631\u062C governorate (\u0645\u062D\u0644 \u0627\u0644\u0645\u064A\u0644\u0627\u062F \u0645\u062B\u0644: \u0627\u0644\u0645\u062D\u0648\u064A\u062A \u0623\u0648 \u0627\u0644\u0623\u0645\u0627\u0646\u0629/\u0635\u0646\u0639\u0627\u0621)\u060C \u0648 placeOfIssue (\u062C\u0647\u0629 \u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0645\u062B\u0644: \u062A\u0639\u0632)\u060C \u0648 profession (\u0627\u0644\u0645\u0647\u0646\u0629 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0645\u062B\u0644: \u0639\u0627\u0645\u0644)\u060C \u0648 gender ("\u0630\u0643\u0631" \u0623\u0648 "\u0623\u0646\u062B\u0649").
   - \u062D\u062F\u062F suggestedDepartment: \u0644\u0644\u062C\u0648\u0627\u0632 \u0627\u0644\u064A\u0645\u0646\u064A \u0627\u062E\u062A\u0631 "travelers"\u060C \u0648\u0644\u0644\u0623\u062C\u0646\u0628\u064A \u0627\u062E\u062A\u0631 "foreigners".
3. \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0645\u062D\u0636\u0631 \u0636\u0628\u0637 \u0623\u0645\u0646\u064A: \u0627\u0645\u0644\u0623 \u0643\u0627\u0626\u0646 seizureData \u0643\u0627\u0645\u0644\u0627\u064B \u0628\u062C\u0645\u064A\u0639 \u0627\u0644\u062C\u0648\u0627\u0632\u0627\u062A \u0648\u0623\u0631\u0642\u0627\u0645\u0647\u0627 \u0648\u0623\u0633\u0645\u0627\u0621 \u0623\u0635\u062D\u0627\u0628\u0647\u0627.`;
    const response = await getAiClient().models.generateContent({
      model: "gemini-4-hydrogen",
      contents: [
        { inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" } },
        { text: prompt }
      ],
      config: {
        responseMimeType: "application/json",
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
                      issueGovernorate: { type: Type.STRING }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    const rawText = response.text || "{}";
    const parsed = JSON.parse(rawText);
    res.json({ success: true, parsed, rawText });
  } catch (error) {
    console.error("Gemini Document Image Analysis Error:", error);
    const status = error.message?.includes("429") || error.status === 429 ? 429 : 500;
    res.status(status).json({ success: false, error: error.message || "Failed to analyze document image" });
  }
});
app.post("/api/gemini/classify-document", async (req, res) => {
  try {
    const { textContent, fileName } = req.body;
    if (!textContent && !fileName) {
      return res.status(400).json({ error: "No content or filename provided" });
    }
    const response = await getAiClient().models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `\u0642\u0645 \u0628\u062A\u062D\u0644\u064A\u0644 \u0646\u0635 \u0623\u0648 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u0646\u062F \u0627\u0644\u0622\u062A\u064A (\u0627\u0633\u0645 \u0627\u0644\u0645\u0644\u0641: ${fileName || "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641"}):
      ---
      ${textContent || ""}
      ---
      \u0642\u0645 \u0628\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0645\u0633\u062A\u0646\u062F \u0628\u062F\u0642\u0629 \u0648\u0625\u0631\u062C\u0627\u0639 \u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0628\u0635\u064A\u063A\u0629 JSON \u0641\u0642\u0637:
      {
        "category": "traveler" | "visa" | "report" | "seizure" | "migrant" | "permit",
        "confidence": 0.95,
        "suggestedModule": "\u0627\u0633\u0645 \u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0645\u0642\u062A\u0631\u062D \u0641\u064A \u0627\u0644\u0646\u0638\u0627\u0645 (\u0645\u0633\u0627\u0641\u0631\u064A\u0646\u060C \u0645\u0630\u0643\u0631\u0627\u062A \u0627\u0644\u062E\u0627\u0631\u062C\u064A\u0629\u060C \u0627\u0644\u0645\u0636\u0628\u0648\u0637\u0627\u062A\u060C \u0627\u0644\u0647\u062C\u0631\u0629\u060C \u0627\u0644\u062A\u0635\u0627\u0631\u064A\u062D)",
        "summary": "\u0645\u0644\u062E\u0635 \u0642\u0635\u064A\u0631 \u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0648\u062B\u064A\u0642\u0629",
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
        responseMimeType: "application/json"
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    res.json({ success: true, classification: parsed });
  } catch (error) {
    console.error("Gemini Classification Error:", error);
    const status = error.message?.includes("429") || error.status === 429 ? 429 : 500;
    res.status(status).json({ success: false, error: error.message || "Failed to classify document" });
  }
});
app.post("/api/gemini/smart-mapping", async (req, res) => {
  try {
    const { columns, sampleRows } = req.body;
    if (!columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: "Columns array is required" });
    }
    const response = await getAiClient().models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `\u0644\u062F\u064A\u0643 \u0623\u0639\u0645\u062F\u0629 \u0645\u0644\u0641 \u0645\u0633\u062A\u0648\u0631\u062F (\u0625\u0643\u0633\u0644 \u0623\u0648 \u0643\u0634\u0641 PDF) \u0644\u0642\u0633\u0645 \u062C\u0648\u0627\u0632\u0627\u062A \u0648\u0645\u0646\u0627\u0641\u0630 \u062D\u062F\u0648\u062F\u064A\u0629:
      \u0627\u0644\u0623\u0639\u0645\u062F\u0629: ${JSON.stringify(columns)}
      \u0639\u064A\u0646\u0627\u062A \u0645\u0646 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A: ${JSON.stringify(sampleRows || [])}
      
      \u0642\u0627\u0626\u0645\u0629 \u062D\u0642\u0648\u0644 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0641\u064A \u0627\u0644\u0646\u0638\u0627\u0645:
      - firstName (\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0623\u0648\u0644)
      - lastName (\u0627\u0633\u0645 \u0627\u0644\u0639\u0627\u0626\u0644\u0629/\u0627\u0644\u0644\u0642\u0628)
      - fullName (\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644)
      - idNumber (\u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0632 \u0623\u0648 \u0627\u0644\u0647\u0648\u064A\u0629)
      - nationality (\u0627\u0644\u062C\u0646\u0633\u064A\u0629)
      - profession (\u0627\u0644\u0645\u0647\u0646\u0629)
      - birthDate (\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u064A\u0644\u0627\u062F)
      - gender (\u0627\u0644\u062C\u0646\u0633)
      - issueDate (\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0635\u062F\u0627\u0631)
      - expiryDate (\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621)
      - organization (\u0627\u0644\u062C\u0647\u0629 / \u0627\u0644\u0645\u0646\u0638\u0645\u0629)
      - visaType (\u0646\u0648\u0639 \u0627\u0644\u062A\u0623\u0634\u064A\u0631\u0629)
      - workLocation (\u0645\u0643\u0627\u0646 \u0627\u0644\u0639\u0645\u0644)
      - additionalInfo (\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0625\u0636\u0627\u0641\u064A\u0629)

      \u0627\u0642\u062A\u0631\u062D \u0644\u0643\u0644 \u0639\u0645\u0648\u062F \u0645\u0646 \u0623\u0639\u0645\u062F\u0629 \u0627\u0644\u0645\u0644\u0641 \u0645\u0627 \u064A\u0646\u0627\u0633\u0628\u0647 \u0645\u0646 \u062D\u0642\u0648\u0644 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A. \u0623\u0631\u062C\u0639 \u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0628\u0635\u064A\u063A\u0629 JSON \u0641\u0642\u0637 \u0643\u0627\u0644\u062A\u0627\u0644\u064A:
      {
        "mappings": [
          { "sourceColumn": "\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u0648\u062F \u0627\u0644\u0623\u0635\u0644\u064A", "targetField": "\u0627\u0633\u0645 \u0627\u0644\u062D\u0642\u0644 \u0627\u0644\u0645\u0642\u062A\u0631\u062D \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", "confidence": 0.98, "reason": "\u0633\u0628\u0628 \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629" }
        ]
      }`,
      config: {
        responseMimeType: "application/json"
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    res.json({ success: true, mappingResult: parsed });
  } catch (error) {
    console.error("Smart Mapping Error:", error);
    const status = error.message?.includes("429") || error.status === 429 ? 429 : 500;
    res.status(status).json({
      success: false,
      error: error.message || "Failed to generate smart mapping",
      details: error.details || []
    });
  }
});
app.post("/api/gemini/transcribe-audio", async (req, res) => {
  try {
    const { audioBase64, mimeType, contextHint } = req.body;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ success: false, error: "No audio data provided" });
    }
    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9.+-]+(?:;[^,]*)?,/, "");
    const normalizedMimeType = typeof mimeType === "string" && mimeType.split(";")[0].trim() || "audio/webm";
    const audioPart = {
      inlineData: {
        mimeType: normalizedMimeType,
        data: cleanBase64
      }
    };
    const instruction = contextHint ? `\u0642\u0645 \u0628\u062A\u0641\u0631\u064A\u063A \u0647\u0630\u0627 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A \u0628\u062F\u0642\u0629 \u0625\u0644\u0649 \u0646\u0635 \u0639\u0631\u0628\u064A \u0641\u0635\u064A\u062D \u0648\u0627\u0636\u062D \u0648\u0645\u0628\u0627\u0634\u0631 \u0645\u0646\u0627\u0633\u0628 \u0644\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062C\u0648\u0627\u0632\u0627\u062A \u0648\u0627\u0644\u0645\u0646\u0627\u0641\u0630 \u0627\u0644\u0623\u0645\u0646\u064A\u0629 (\u0627\u0644\u0633\u064A\u0627\u0642: ${contextHint}). \u062D\u0627\u0641\u0638 \u0639\u0644\u0649 \u062F\u0642\u0629 \u0627\u0644\u0623\u0633\u0645\u0627\u0621 \u0648\u0623\u0631\u0642\u0627\u0645 \u0627\u0644\u062C\u0648\u0627\u0632\u0627\u062A \u0648\u0627\u0644\u0644\u0648\u062D\u0627\u062A \u0648\u0627\u0644\u062A\u0648\u0627\u0631\u064A\u062E \u0643\u0645\u0627 \u0646\u064F\u0637\u0642\u062A. \u0623\u0639\u062F \u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u0641\u0631\u063A \u0641\u0642\u0637 \u062F\u0648\u0646 \u0623\u064A \u0645\u0642\u062F\u0645\u0627\u062A \u0623\u0648 \u0634\u0631\u0648\u062D\u0627\u062A.` : "\u0642\u0645 \u0628\u062A\u0641\u0631\u064A\u063A \u0647\u0630\u0627 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A \u0628\u062F\u0642\u0629 \u0625\u0644\u0649 \u0646\u0635 \u0639\u0631\u0628\u064A \u0648\u0627\u0636\u062D \u0648\u0645\u0628\u0627\u0634\u0631\u060C \u0645\u0639 \u0627\u0644\u062D\u0641\u0627\u0638 \u0639\u0644\u0649 \u062F\u0642\u0629 \u0627\u0644\u0623\u0633\u0645\u0627\u0621 \u0648\u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u0643\u0645\u0627 \u0646\u064F\u0637\u0642\u062A. \u0623\u0639\u062F \u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u0641\u0631\u063A \u0641\u0642\u0637 \u062F\u0648\u0646 \u0623\u064A \u0625\u0636\u0627\u0641\u0627\u062A.";
    const response = await getAiClient().models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: { parts: [audioPart, { text: instruction }] }
    });
    const text = (response.text || "").trim();
    res.json({ success: true, text });
  } catch (error) {
    console.error("Gemini Audio Transcription Error:", error);
    const status = error.message?.includes("429") || error.status === 429 ? 429 : 500;
    res.status(status).json({
      success: false,
      error: error.message || "Failed to transcribe audio"
    });
  }
});
app.post("/api/gemini/maps-grounding", async (req, res) => {
  try {
    const { query, latitude, longitude } = req.body;
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ success: false, error: "Query is required" });
    }
    const hasValidCoords = typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude);
    const config = {
      tools: [{ googleMaps: {} }]
    };
    if (hasValidCoords) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude,
            longitude
          }
        }
      };
    }
    const prompt = `\u0623\u062C\u0628 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0628\u0634\u0643\u0644 \u0645\u0646\u0638\u0645 \u0648\u0645\u0641\u064A\u062F \u0644\u0636\u0628\u0627\u0637 \u0627\u0644\u0645\u0646\u0627\u0641\u0630 \u0648\u0627\u0644\u062C\u0648\u0627\u0632\u0627\u062A \u0648\u062A\u0635\u0627\u0631\u064A\u062D \u0627\u0644\u062A\u0646\u0642\u0644 \u0641\u064A \u0627\u0644\u062C\u0645\u0647\u0648\u0631\u064A\u0629 \u0627\u0644\u064A\u0645\u0646\u064A\u0629 \u0639\u0646 \u0627\u0644\u0627\u0633\u062A\u0639\u0644\u0627\u0645 \u0627\u0644\u062C\u063A\u0631\u0627\u0641\u064A \u0627\u0644\u062A\u0627\u0644\u064A\u060C \u0645\u0639 \u062A\u0648\u0636\u064A\u062D \u0627\u0644\u0645\u062F\u0646 \u0648\u0627\u0644\u0645\u062D\u0627\u0641\u0638\u0627\u062A \u0648\u0627\u0644\u0645\u0633\u0627\u0641\u0627\u062A \u0648\u0627\u0644\u0645\u0639\u0627\u0644\u0645 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 \u0648\u0627\u0644\u0646\u0642\u0627\u0637 \u0627\u0644\u0645\u062A\u0627\u062D\u0629:
${query.trim()}`;
    const response = await getAiClient().models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config
    });
    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const mapSources = rawChunks.map((chunk) => {
      if (!chunk?.maps) return null;
      const reviewSnippets = Array.isArray(chunk.maps.placeAnswerSources?.reviewSnippets) ? chunk.maps.placeAnswerSources.reviewSnippets.map((s) => ({
        uri: s?.uri || "",
        title: s?.title || "",
        snippet: s?.snippet || ""
      })).filter((s) => s.uri || s.snippet) : [];
      return {
        title: chunk.maps.title || "\u0645\u0648\u0642\u0639 \u0639\u0644\u0649 \u062E\u0631\u0627\u0626\u0637 Google",
        uri: chunk.maps.uri || "",
        placeId: chunk.maps.placeId || "",
        reviewSnippets
      };
    }).filter((item) => item && (item.uri || item.title));
    res.json({
      success: true,
      text: (response.text || "").trim(),
      sources: mapSources
    });
  } catch (error) {
    console.error("Gemini Maps Grounding Error:", error);
    const status = error.message?.includes("429") || error.status === 429 ? 429 : 500;
    res.status(status).json({
      success: false,
      error: error.message || "Failed to query Google Maps grounding"
    });
  }
});
function resolveListenPort() {
  const portFlagIdx = process.argv.indexOf("--port");
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT || 8080);
  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT || 3e3);
  if (process.env.NODE_ENV !== "production" && envPort === nginxPort) {
    return defaultAppPort;
  }
  return Number.isFinite(envPort) && envPort > 0 ? envPort : defaultAppPort;
}
async function startServer() {
  const PORT = resolveListenPort();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : void 0
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve("dist", "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
  server.on("error", (err) => {
    console.error(`Failed to bind server on 0.0.0.0:${PORT}:`, err);
    process.exit(1);
  });
}
startServer().catch((err) => {
  console.error("Fatal error during server startup:", err);
  process.exit(1);
});
