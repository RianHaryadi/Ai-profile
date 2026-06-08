"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatBotProps {
  slug: string;
  profileName: string;
  presetQuestions?: string[];
  isActive?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ChatBot({
  slug,
  profileName,
  presetQuestions = [],
  isActive = true,
}: ChatBotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Halo! Saya asisten AI untuk ${profileName}. Silakan tanyakan apa saja tentang produk, layanan, atau kerja sama.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !isActive) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput("");
    setIsLoading(true);

    // Build history = all messages BEFORE the current one, excluding the initial greeting
    const history = messages
      .slice(1) // skip the initial AI greeting
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch(`${API_URL}/api/chat/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      const aiMessage: Message = {
        role: "assistant",
        content: data.response,
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Maaf, terjadi kesalahan. Silakan coba lagi atau hubungi langsung.",
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handlePresetClick = (question: string) => {
    sendMessage(question);
  };

  if (!isActive) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[520px] p-0 overflow-hidden text-left">
        <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-2xl">
            💤
          </div>
          <p className="text-slate-900 font-bold font-primary">Asisten AI sedang offline</p>
          <p className="text-xs text-slate-500 max-w-[280px] leading-relaxed">
            Asisten chatbot sedang tidak diaktifkan oleh pemilik kartu bisnis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[520px] p-0 overflow-hidden text-left w-full" id="chatbot">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50/80 text-xs font-bold text-slate-600 tracking-wide">
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        <span>Tanya AI • {profileName}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-slate-50/30">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-3 max-w-[85%] items-start animate-fade-in ${
              msg.role === "user" ? "self-end flex-row-reverse" : "self-start"
            }`}
            style={{ animationDelay: `${idx * 0.05}s` }}
          >
            {msg.role === "assistant" ? (
              <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center text-sm flex-shrink-0 border border-accent-primary/20 shadow-sm select-none">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-primary" strokeWidth="2"><path d="M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center text-[0.65rem] font-bold text-white flex-shrink-0 shadow-sm select-none">
                ME
              </div>
            )}
            <div
              className={`p-3.5 text-xs sm:text-sm leading-relaxed rounded-2xl whitespace-pre-line shadow-sm border ${
                msg.role === "user" 
                  ? "bg-accent-primary text-white rounded-tr-none border-transparent" 
                  : "bg-white border-slate-200 text-slate-800 rounded-tl-none"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 max-w-[85%] items-start self-start">
            <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center text-sm flex-shrink-0 border border-accent-primary/20 select-none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-primary" strokeWidth="2"><path d="M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
            </div>
            <div className="p-3.5 text-sm leading-relaxed rounded-2xl bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm">
              <div className="flex items-center gap-1.5 py-1 px-2.5">
                <span className="w-1.5 h-1.5 bg-accent-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-accent-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-accent-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Preset Questions */}
      {presetQuestions.length > 0 && messages.length <= 2 && (
        <div className="flex gap-2 p-4 pt-2 flex-wrap bg-white border-t border-slate-100">
          {presetQuestions.map((q, idx) => (
            <button
              key={idx}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-full text-xs font-semibold text-slate-600 hover:bg-accent-primary/5 hover:border-accent-primary/20 hover:text-accent-primary transition-all cursor-pointer max-w-full text-left truncate"
              onClick={() => handlePresetClick(q)}
              disabled={isLoading}
              id={`preset-question-${idx}`}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form className="flex p-4 border-t border-slate-100 bg-white gap-3 items-center" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ketik pertanyaan untuk AI..."
          className="flex-1 py-2.5 px-4 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
          disabled={isLoading}
          maxLength={1000}
          id="chat-input"
          autoComplete="off"
        />
        <button
          type="submit"
          className="w-10 h-10 flex items-center justify-center bg-accent-primary hover:bg-accent-secondary rounded-xl text-white border-none cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 shadow-sm shadow-blue-500/20"
          disabled={isLoading || !input.trim()}
          id="chat-send-button"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
