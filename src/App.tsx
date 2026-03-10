import React, { useState, useEffect } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { Loader2, Plus, AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Emotion {
  id: string;
  name: string;
  meaning?: string;
  example?: string;
  created_at: string;
}

export default function App() {
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [newEmotion, setNewEmotion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  
  // Popup state
  const [selectedEmotion, setSelectedEmotion] = useState<Emotion | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    fetchEmotions();
  }, []);

  const fetchEmotions = async () => {
    try {
      const response = await fetch("/api/emotions");
      if (response.ok) {
        const data = await response.json();
        setEmotions(data);
      }
    } catch (error) {
      console.error("Failed to fetch emotions:", error);
      setMessage({ type: "error", text: "感情リストの取得に失敗しました。" });
    } finally {
      setIsLoading(false);
    }
  };

  const generateEmotionDetails = async (emotionName: string) => {
    try {
      const prompt = `「${emotionName}」という感情について、以下の2点をJSON形式で生成してください。
1. meaning: その感情の簡単な意味や説明（50文字程度）
2. example: その感情を抱く具体的な状況の例文（1つ）`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              meaning: { type: Type.STRING },
              example: { type: Type.STRING }
            },
            required: ["meaning", "example"]
          }
        }
      });

      const jsonStr = response.text?.trim();
      if (jsonStr) {
        return JSON.parse(jsonStr);
      }
    } catch (error) {
      console.error("Failed to generate details:", error);
    }
    return { meaning: "意味を取得できませんでした。", example: "例文を取得できませんでした。" };
  };

  const handleEmotionClick = async (emotion: Emotion) => {
    setSelectedEmotion(emotion);
    if (!emotion.meaning || !emotion.example) {
      setIsLoadingDetails(true);
      try {
        const details = await generateEmotionDetails(emotion.name);
        
        // Save to backend
        const response = await fetch(`/api/emotions/${emotion.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(details),
        });
        
        if (response.ok) {
          const updatedEmotion = await response.json();
          setSelectedEmotion(updatedEmotion);
          setEmotions(prev => prev.map(e => e.id === updatedEmotion.id ? updatedEmotion : e));
        } else {
          // Fallback to just showing the generated details if save fails
          setSelectedEmotion({ ...emotion, ...details });
        }
      } catch (error) {
        console.error("Failed to fetch details:", error);
      } finally {
        setIsLoadingDetails(false);
      }
    }
  };

  const checkDuplicate = async (input: string, existingNames: string[]) => {
    try {
      const prompt = `以下の「新しい言葉」が、「既存の感情リスト」の中に、ひらがな・カタカナ・漢字の違いだけで実質的に同じ言葉として既に存在するかどうかを判定してください。
例えば、「うれしい」と「嬉しい」、「かなしい」と「悲しい」は同じとみなします。

新しい言葉: 「${input}」
既存の感情リスト: ${JSON.stringify(existingNames)}

JSON形式で返してください。
isDuplicate: true または false
matchedWord: 重複していると判定された既存の言葉（重複していない場合は空文字列）`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isDuplicate: { type: Type.BOOLEAN },
              matchedWord: { type: Type.STRING }
            },
            required: ["isDuplicate", "matchedWord"]
          }
        }
      });

      const jsonStr = response.text?.trim();
      if (!jsonStr) return { isDuplicate: false, matchedWord: "" };
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error("Duplicate check failed:", error);
      return { isDuplicate: false, matchedWord: "" };
    }
  };

  const classifyEmotion = async (input: string) => {
    try {
      const prompt = `あなたは入力された言葉が「感情」に関するものかどうかを判定するAIです。
以下の言葉を3つのカテゴリのいずれかに分類し、JSON形式で返してください。

カテゴリ：
1: 感情である (Emotion) - 例: 嬉しい、悲しい、焦り、安心感、好き、嫌だ
2: 感情ではない (Not an emotion) - 例: りんご、走る、机、明日
3: 感情の状態である (State of emotion) - 例: 泣いている、震えている、うつ状態、パニック、笑顔

言葉: 「${input}」`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.INTEGER,
                description: "1, 2, または 3のいずれか",
              },
              reason: {
                type: Type.STRING,
                description: "判定理由",
              },
            },
            required: ["category", "reason"],
          },
        },
      });

      const jsonStr = response.text?.trim();
      if (!jsonStr) throw new Error("Empty response from AI");
      
      const result = JSON.parse(jsonStr);
      return result as { category: number; reason: string };
    } catch (error) {
      console.error("AI classification failed:", error);
      throw new Error("AIによる判定に失敗しました。");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = newEmotion.trim();
    if (!trimmedInput) return;

    setIsSubmitting(true);
    setMessage(null);

    try {
      // 0. Check for semantic duplicates locally
      const existingNames = emotions.map(e => e.name);
      
      // Simple exact match first
      if (existingNames.includes(trimmedInput)) {
        setMessage({ type: "info", text: `「${trimmedInput}」は既に登録されています。` });
        setIsSubmitting(false);
        return;
      }

      // AI semantic match
      const duplicateData = await checkDuplicate(trimmedInput, existingNames);
      if (duplicateData.isDuplicate) {
        setMessage({ type: "info", text: `「${trimmedInput}」は「${duplicateData.matchedWord}」として既に登録されています。` });
        setIsSubmitting(false);
        return;
      }

      // 1. Classify with AI
      const classification = await classifyEmotion(trimmedInput);

      if (classification.category === 2) {
        setMessage({ type: "error", text: `「${trimmedInput}」は感情ではありません。` });
        setIsSubmitting(false);
        return;
      }

      if (classification.category === 3) {
        setMessage({ type: "error", text: `「${trimmedInput}」は状態です。` });
        setIsSubmitting(false);
        return;
      }

      // 2. Generate details before saving
      const details = await generateEmotionDetails(trimmedInput);

      // 3. Save to DB
      const response = await fetch("/api/emotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: trimmedInput,
          meaning: details.meaning,
          example: details.example
        }),
      });

      if (response.ok) {
        const addedEmotion = await response.json();
        setEmotions((prev) => [...prev, addedEmotion]);
        setNewEmotion("");
        setMessage({ type: "success", text: `「${trimmedInput}」をリストに追加しました！` });
      } else if (response.status === 409) {
        setMessage({ type: "info", text: `「${trimmedInput}」は既に登録されています。` });
      } else {
        throw new Error("データベースへの保存に失敗しました。");
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "エラーが発生しました。" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfaf8] text-[#4a4443] font-sans selection:bg-rose-200">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-[#4a4443] mb-4 font-serif">
            Emotion Dictionary
          </h1>
          <p className="text-[#8a7f7d] max-w-2xl mx-auto leading-relaxed">
            あなたが知っている「感情」を追加して、みんなでリストを育てましょう。
            AIが入力された言葉が本当に感情かどうかを判定します。
          </p>
        </header>

        <div className="bg-white/80 backdrop-blur-sm rounded-[2rem] shadow-sm border border-[#f0e8e6] p-6 md:p-8 mb-12">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-grow">
              <label htmlFor="emotion-input" className="sr-only">新しい感情</label>
              <input
                id="emotion-input"
                type="text"
                value={newEmotion}
                onChange={(e) => setNewEmotion(e.target.value)}
                placeholder="例: 嬉しい、切ない、もどかしい..."
                className="w-full px-5 py-3.5 rounded-full border border-[#e6dedc] focus:outline-none focus:ring-2 focus:ring-[#d49a89] focus:border-transparent transition-shadow text-lg bg-white/50"
                disabled={isSubmitting}
                maxLength={30}
              />
            </div>
            <button
              type="submit"
              disabled={!newEmotion.trim() || isSubmitting}
              className="inline-flex items-center justify-center px-8 py-3.5 border border-transparent text-base font-medium rounded-full text-white bg-[#d49a89] hover:bg-[#c28473] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#d49a89] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                  判定中...
                </>
              ) : (
                <>
                  <Plus className="-ml-1 mr-2 h-5 w-5" />
                  追加する
                </>
              )}
            </button>
          </form>

          <AnimatePresence mode="wait">
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`mt-4 p-4 rounded-2xl flex items-start gap-3 ${
                  message.type === "success" ? "bg-[#fdf8f6] text-[#b36b59] border border-[#f5e6e1]" :
                  message.type === "error" ? "bg-red-50 text-red-800 border border-red-100" :
                  "bg-blue-50 text-blue-800 border border-blue-100"
                }`}
              >
                {message.type === "success" && <CheckCircle2 className="h-5 w-5 text-[#d49a89] shrink-0 mt-0.5" />}
                {message.type === "error" && <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />}
                {message.type === "info" && <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />}
                <p className="font-medium">{message.text}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-semibold text-[#4a4443] font-serif">
              登録されている感情
            </h2>
            <span className="bg-white border border-[#e6dedc] text-[#8a7f7d] py-1.5 px-4 rounded-full text-sm font-medium shadow-sm">
              {emotions.length} 件
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin h-8 w-8 text-[#d49a89]" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <AnimatePresence>
                {emotions.map((emotion) => (
                  <motion.div
                    key={emotion.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    layout
                    onClick={() => handleEmotionClick(emotion)}
                    className="bg-white border border-[#e6dedc] rounded-full px-5 py-2.5 text-center shadow-sm hover:shadow-md transition-all hover:border-[#d49a89] cursor-pointer hover:-translate-y-0.5"
                  >
                    <span className="text-[#4a4443] font-medium tracking-wide">{emotion.name}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Popup Modal */}
      <AnimatePresence>
        {selectedEmotion && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEmotion(null)}
              className="fixed inset-0 bg-[#4a4443]/20 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white/95 backdrop-blur-md rounded-[2rem] shadow-xl z-50 overflow-hidden border border-[#f0e8e6]"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-3xl font-bold text-[#4a4443] font-serif">
                    {selectedEmotion.name}
                  </h3>
                  <button
                    onClick={() => setSelectedEmotion(null)}
                    className="p-1.5 text-[#8a7f7d] hover:text-[#4a4443] hover:bg-[#fcfaf8] rounded-full transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {isLoadingDetails ? (
                  <div className="flex flex-col items-center justify-center py-10 space-y-4">
                    <Loader2 className="h-8 w-8 text-[#d49a89] animate-spin" />
                    <p className="text-sm text-[#8a7f7d]">意味と例文を生成中...</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div>
                      <h4 className="text-xs font-bold text-[#d49a89] uppercase tracking-widest mb-3">意味</h4>
                      <p className="text-[#4a4443] leading-relaxed text-lg">
                        {selectedEmotion.meaning}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#d49a89] uppercase tracking-widest mb-3">例文</h4>
                      <div className="bg-[#fcfaf8] p-5 rounded-2xl border border-[#f0e8e6]">
                        <p className="text-[#4a4443] italic leading-relaxed">
                          「{selectedEmotion.example}」
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
