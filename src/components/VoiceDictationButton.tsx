import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { transcribeAudioWithGemini } from '@/services/geminiService';

interface VoiceDictationButtonProps {
  onTranscript: (text: string) => void;
  contextHint?: string;
  label?: string;
  size?: 'xs' | 'sm' | 'default';
  className?: string;
  disabled?: boolean;
}

/**
 * Reusable Arabic Voice Dictation button for officers.
 * Uses MediaRecorder -> /api/gemini/transcribe-audio (gemini-3.5-transcribe) when online,
 * with graceful fallback to browser Web Speech API when offline/standalone.
 */
export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  onTranscript,
  contextHint,
  label = 'إملاء صوتي',
  size = 'xs',
  className = '',
  disabled = false,
}) => {
  const { toast } = useToast();
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimerAndStream = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimerAndStream();
      try {
        speechRecRef.current?.stop?.();
      } catch {
        // ignore cleanup error
      }
    };
  }, []);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = typeof reader.result === 'string' ? reader.result : '';
        const commaIndex = res.indexOf(',');
        resolve(commaIndex !== -1 ? res.slice(commaIndex + 1) : res);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const startWebSpeechFallback = () => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      toast({
        title: 'الإملاء الصوتي غير متاح أوفلاين',
        description: 'يتطلب التفريغ الصوتي السحابي الاتصال بالخادم، أو متصفحاً يدعم الإملاء المحلي.',
        variant: 'destructive',
      });
      setRecordingState('idle');
      return;
    }

    try {
      const rec = new SpeechRecognitionCtor();
      speechRecRef.current = rec;
      rec.lang = 'ar-YE';
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          onTranscript(transcript);
          toast({ title: 'تم الإملاء الصوتي (محلي)', description: 'تمت إضافة النص الصوتي إلى الحقل.' });
        }
      };

      rec.onerror = () => {
        setRecordingState('idle');
        clearTimerAndStream();
      };

      rec.onend = () => {
        setRecordingState('idle');
        clearTimerAndStream();
      };

      setRecordingState('recording');
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
      rec.start();
    } catch {
      setRecordingState('idle');
      clearTimerAndStream();
    }
  };

  const handleToggleRecording = async () => {
    if (recordingState === 'transcribing') return;

    if (recordingState === 'recording') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else if (speechRecRef.current) {
        speechRecRef.current.stop();
      } else {
        setRecordingState('idle');
        clearTimerAndStream();
      }
      return;
    }

    // Check if running completely offline without server or MediaRecorder
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      startWebSpeechFallback();
      return;
    }

    if (!navigator.onLine) {
      startWebSpeechFallback();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const chosenMime = preferredTypes.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || chosenMime || 'audio/webm';
        clearTimerAndStream();

        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (audioBlob.size < 250) {
          setRecordingState('idle');
          return;
        }

        setRecordingState('transcribing');
        try {
          const base64 = await blobToBase64(audioBlob);
          const result = await transcribeAudioWithGemini(base64, mimeType, contextHint);
          if (result.success && result.text) {
            onTranscript(result.text);
            toast({
              title: 'تم التفريغ الصوتي بدقة',
              description: 'تم تحويل التسجيل الصوتي وإدراجه في الحقل بنجاح.',
            });
          } else {
            toast({
              title: 'تعذر التفريغ الصوتي',
              description: result.error || 'حاول التحدث بوضوح أو التحقق من اتصال الخادم.',
              variant: 'destructive',
            });
          }
        } catch {
          toast({
            title: 'خطأ في معالجة الصوت',
            description: 'يرجى المحاولة مرة أخرى أو الكتابة مباشرة.',
            variant: 'destructive',
          });
        } finally {
          setRecordingState('idle');
        }
      };

      setRecordingState('recording');
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
      recorder.start();
    } catch (err: any) {
      clearTimerAndStream();
      setRecordingState('idle');
      const isPermissionDenied =
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      toast({
        title: isPermissionDenied ? 'إذن الميكروفون مرفوض' : 'تعذر تشغيل الميكروفون',
        description: isPermissionDenied
          ? 'يرجى السماح للمتصفح بالوصول إلى الميكروفون لاستخدام الإملاء الصوتي.'
          : 'تأكد من توصيل الميكروفون أو تفعيل الإذن.',
        variant: 'destructive',
      });
    }
  };

  const formattedTime = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(
    elapsedSeconds % 60
  ).padStart(2, '0')}`;

  return (
    <Button
      type="button"
      size={size}
      variant={recordingState === 'recording' ? 'destructive' : 'outline'}
      disabled={disabled || recordingState === 'transcribing'}
      onClick={handleToggleRecording}
      className={`gap-1.5 whitespace-nowrap shrink-0 font-bold ${
        recordingState === 'idle'
          ? 'border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-800'
          : ''
      } ${className}`}
      title="تسجيل صوتي وتفريغ تلقائي بالذكاء الاصطناعي"
    >
      {recordingState === 'recording' ? (
        <>
          <Square className="h-3.5 w-3.5 fill-current animate-pulse" />
          <span className="font-mono tabular-nums">{formattedTime}</span>
          <span>إيقاف وتفريغ</span>
        </>
      ) : recordingState === 'transcribing' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>جاري التفريغ...</span>
        </>
      ) : (
        <>
          <Mic className="h-3.5 w-3.5" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
};
