'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Send,
  Bot,
  User,
  RefreshCw,
  ShoppingCart,
  KeyRound,
  Users,
  ChevronRight,
  TrendingUp,
  Star,
  Tag,
  BarChart2,
  UserPlus,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export default function AdminChatbotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chats when a new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await api.askAdminChatbot(text.trim());
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        sender: 'assistant',
        text: response.reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to connect to the backend server.';
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        sender: 'assistant',
        text: `❌ **Failed to retrieve answer from AI Chatbot.**\n\n*Error details:* ${errorMsg}\n\nPlease check your server connection or verify that the \`GEMINI_API_KEY\` is configured in your server \`.env\` file.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages([]);
  };

  // Clickable suggestion cards
  const dynamicPrompts = [
    {
      title: 'Dashboard Overview',
      desc: "Today's orders, revenue, and pending fulfillments.",
      query: "give me an overview of today's orders, revenue, and customer counts",
      icon: TrendingUp,
      color: 'from-purple-500/10 to-pink-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    },
    {
      title: 'Low Stock Alert',
      desc: 'Which products are running low on stock?',
      query: 'which products are low on stock',
      icon: ShoppingCart,
      color: 'from-orange-500/10 to-amber-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    },
    {
      title: 'Abandoned Carts',
      desc: 'Customers who had items in cart but never ordered.',
      query: 'which customers left without ordering, show their names and phone numbers',
      icon: Users,
      color: 'from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    },
    {
      title: 'Revenue Trend',
      desc: 'Day-by-day revenue for the last 14 days.',
      query: 'show revenue trend for last 14 days',
      icon: BarChart2,
      color: 'from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    },
    {
      title: 'Order Status Breakdown',
      desc: 'Count of orders in each status bucket.',
      query: 'how many orders are in each status',
      icon: Tag,
      color: 'from-rose-500/10 to-pink-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    },
    {
      title: 'Recent Feedback',
      desc: 'Latest product reviews and customer feedback.',
      query: 'show me recent customer reviews and feedback',
      icon: Star,
      color: 'from-yellow-500/10 to-amber-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    },
    {
      title: 'Active Coupons',
      desc: 'All coupons, their usage, and expiry status.',
      query: 'show me all coupons and their usage',
      icon: KeyRound,
      color: 'from-cyan-500/10 to-sky-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    },
    {
      title: 'New Customers',
      desc: 'Customers who joined in the last 7 days.',
      query: 'show new customers who joined this week',
      icon: UserPlus,
      color: 'from-violet-500/10 to-purple-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    },
  ];

  // A custom lightweight high-fidelity React Markdown renderer
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      let trimmed = line.trim();

      // Heading 3
      if (trimmed.startsWith('###')) {
        return (
          <h4 key={lineIdx} className="text-md font-bold text-[#1E3D2B] dark:text-[#E8A838] mt-3 mb-1 first:mt-0 flex items-center gap-1.5">
            <ChevronRight className="h-4 w-4 text-[#E8A838]" />
            {parseInlineStyles(trimmed.slice(3).trim())}
          </h4>
        );
      }
      // Heading 2
      if (trimmed.startsWith('##')) {
        return (
          <h3 key={lineIdx} className="text-lg font-bold text-[#1E3D2B] dark:text-white mt-4 mb-2 first:mt-0 border-b border-gray-100 pb-1">
            {parseInlineStyles(trimmed.slice(2).trim())}
          </h3>
        );
      }
      // Heading 1
      if (trimmed.startsWith('#')) {
        return (
          <h2 key={lineIdx} className="text-xl font-bold text-[#1E3D2B] dark:text-white mt-5 mb-2 first:mt-0 pb-1">
            {parseInlineStyles(trimmed.slice(1).trim())}
          </h2>
        );
      }

      // Blockquote or Warn Card
      if (trimmed.startsWith('>')) {
        return (
          <div key={lineIdx} className="bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-3 rounded-r-lg my-2 text-sm text-amber-900 dark:text-amber-300">
            {parseInlineStyles(trimmed.slice(1).trim())}
          </div>
        );
      }

      // Bullet points
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        // Nested bullet point detection
        const isNested = line.startsWith('  ') || line.startsWith('\t');
        return (
          <ul key={lineIdx} className={cn("list-disc list-inside text-sm text-gray-700 dark:text-gray-300 my-0.5", isNested ? "pl-6 text-gray-500" : "pl-3")}>
            <li className="leading-relaxed">
              {parseInlineStyles(trimmed.slice(1).trim())}
            </li>
          </ul>
        );
      }

      // Number lists
      const numberMatch = trimmed.match(/^(\d+)\.\s(.*)/);
      if (numberMatch) {
        return (
          <ol key={lineIdx} className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-300 pl-3 my-0.5">
            <li className="leading-relaxed">
              {parseInlineStyles(numberMatch[2].trim())}
            </li>
          </ol>
        );
      }

      // Code blocks
      if (trimmed.startsWith('```')) {
        return null; // Skip wrapper fences
      }

      // Empty line
      if (trimmed === '') {
        return <div key={lineIdx} className="h-2" />;
      }

      // Plain paragraph
      return (
        <p key={lineIdx} className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 my-1">
          {parseInlineStyles(trimmed)}
        </p>
      );
    });
  };

  // Helper to parse inline bold **bold** and code `code`
  const parseInlineStyles = (content: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let currentText = content;
    let keyIdx = 0;

    while (currentText.length > 0) {
      const boldMatch = currentText.match(/\*\*(.*?)\*\*/);
      const codeMatch = currentText.match(/`(.*?)`/);

      const boldIndex = boldMatch ? currentText.indexOf(boldMatch[0]) : -1;
      const codeIndex = codeMatch ? currentText.indexOf(codeMatch[0]) : -1;

      // Neither found
      if (boldIndex === -1 && codeIndex === -1) {
        parts.push(<span key={keyIdx++}>{currentText}</span>);
        break;
      }

      // Bold match occurs first
      if (boldIndex !== -1 && (codeIndex === -1 || boldIndex < codeIndex)) {
        if (boldIndex > 0) {
          parts.push(<span key={keyIdx++}>{currentText.slice(0, boldIndex)}</span>);
        }
        parts.push(
          <strong key={keyIdx++} className="font-extrabold text-brand-charcoal dark:text-white">
            {boldMatch![1]}
          </strong>
        );
        currentText = currentText.slice(boldIndex + boldMatch![0].length);
      }
      // Code match occurs first
      else {
        if (codeIndex > 0) {
          parts.push(<span key={keyIdx++}>{currentText.slice(0, codeIndex)}</span>);
        }
        parts.push(
          <code key={keyIdx++} className="bg-gray-100 dark:bg-gray-800 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-mono text-xs font-semibold">
            {codeMatch![1]}
          </code>
        );
        currentText = currentText.slice(codeIndex + codeMatch![0].length);
      }
    }

    return parts;
  };

  return (
    <div className="flex flex-col h-screen bg-[#F7F5F0] dark:bg-background">
      <Header title="AI Chatbot" description="Talk to your dashboard data intelligently" />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-h-0 p-6">
        <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 max-w-7xl w-full mx-auto">
          
          {/* Chat Window Container */}
          <div className="flex-1 flex flex-col bg-white/70 dark:bg-[#1E3D2B]/10 backdrop-blur-md border border-white/40 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden min-h-0">
            
            {/* Window Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5 bg-white/40 dark:bg-black/20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 rounded-xl bg-brand-green/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-brand-green animate-pulse" />
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] text-gray-900 dark:text-white leading-tight">Naturelite AI Assistant</h3>
                  <span className="text-[10px] text-muted-foreground font-mono">powered by gemini-1.5-flash</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleResetChat}
                  title="Clear Conversation"
                  className="hover:bg-red-500/10 hover:text-red-500 text-gray-400 rounded-full h-8 w-8 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
              <AnimatePresence initial={false}>
                {messages.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="h-full flex flex-col justify-center items-center text-center p-4 max-w-lg mx-auto"
                  >
                    <div className="h-16 w-16 rounded-full bg-brand-green/5 border border-brand-green/20 flex items-center justify-center mb-5 animate-bounce">
                      <Bot className="h-8 w-8 text-brand-green" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Welcome to Naturelite AI!</h2>
                    <p className="text-sm text-muted-foreground mb-8">
                      I have complete dynamic access to your admin logins count, low stock inventories, incomplete support chats, and order revenue. Feel free to click any suggestion below to test me instantly!
                    </p>

                    {/* Quick Access Prompts */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                      {dynamicPrompts.map((p, idx) => (
                        <motion.div
                          key={idx}
                          whileHover={{ y: -3, scale: 1.01 }}
                          onClick={() => handleSendMessage(p.query)}
                          className={cn(
                            "cursor-pointer p-4 rounded-xl border bg-gradient-to-r flex flex-col text-left transition-all duration-200",
                            p.color
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <p.icon className="h-4.5 w-4.5" />
                            <h4 className="font-bold text-[13px] tracking-tight">{p.title}</h4>
                          </div>
                          <p className="text-[11px] leading-normal opacity-80">{p.desc}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex items-start gap-3.5 max-w-[85%] rounded-2xl p-4 shadow-sm",
                        msg.sender === 'user'
                          ? "ml-auto bg-brand-green text-white rounded-tr-none flex-row-reverse"
                          : "bg-white dark:bg-[#1E3D2B]/30 border border-gray-100 dark:border-white/5 rounded-tl-none"
                      )}
                    >
                      {/* Avatar */}
                      <div className={cn(
                        "h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold",
                        msg.sender === 'user' ? "bg-white/10 text-white" : "bg-brand-green/10 text-brand-green"
                      )}>
                        {msg.sender === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>

                      {/* Message Body */}
                      <div className="flex-1 overflow-hidden min-w-0">
                        {msg.sender === 'user' ? (
                          <p className="text-sm font-medium leading-relaxed break-words">{msg.text}</p>
                        ) : (
                          <div className="space-y-1.5 break-words">
                            {renderMarkdown(msg.text)}
                          </div>
                        )}
                        <span className={cn(
                          "block text-[9px] mt-1.5 font-mono",
                          msg.sender === 'user' ? "text-white/40 text-right" : "text-muted-foreground"
                        )}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}

                {/* Loading typing indicator */}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3.5 max-w-[50%] bg-white dark:bg-[#1E3D2B]/30 border border-gray-100 dark:border-white/5 rounded-2xl rounded-tl-none p-4 shadow-sm"
                  >
                    <div className="h-8 w-8 rounded-lg shrink-0 bg-brand-green/10 flex items-center justify-center text-brand-green">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col gap-1 mt-2.5">
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-brand-green animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-2 w-2 rounded-full bg-brand-green animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-2 w-2 rounded-full bg-brand-green animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground font-mono mt-1">Analyzing database feeds...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 bg-white/40 dark:bg-black/10 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage(inputValue);
                }}
                className="flex items-center gap-3 bg-white dark:bg-background border border-gray-200 dark:border-white/10 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-brand-green transition-all"
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={isLoading ? "Thinking..." : "Ask me anything (e.g. 'how many logins we have' or 'which products are low on stock')" }
                  disabled={isLoading}
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-gray-400 dark:text-white"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!inputValue.trim() || isLoading}
                  className="bg-brand-green hover:bg-[#153125] text-white rounded-lg h-9 w-9 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
            
          </div>

          {/* Sidebar Status Info Panel */}
          <div className="w-full md:w-80 shrink-0 flex flex-col gap-6">
            <Card className="rounded-2xl border-white/40 bg-white/50 backdrop-blur-md shadow-lg overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Sparkles className="h-4 w-4 text-brand-green" />
                  <h4 className="font-bold text-[14px] text-gray-900 dark:text-white">Dynamic AI Context Hub</h4>
                </div>
                
                <p className="text-xs leading-normal text-muted-foreground">
                  Our custom query pipeline hooks directly into Naturelite's live databases. Hallucinations are actively disabled by supplying strict dynamic variables:
                </p>

                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600 shrink-0 mt-0.5">
                      <TrendingUp className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h5 className="text-[12px] font-bold text-gray-800 dark:text-gray-200">Orders & Revenue</h5>
                      <p className="text-[10px] text-muted-foreground leading-normal">Dashboard stats, status breakdowns, revenue trends, and order history.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h5 className="text-[12px] font-bold text-gray-800 dark:text-gray-200">Full Customer Data</h5>
                      <p className="text-[10px] text-muted-foreground leading-normal">Search customers, view order history, top spenders, and new signups.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-600 shrink-0 mt-0.5">
                      <ShoppingCart className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h5 className="text-[12px] font-bold text-gray-800 dark:text-gray-200">Inventory & Products</h5>
                      <p className="text-[10px] text-muted-foreground leading-normal">Low stock alerts, product search, and top-selling item rankings.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-600 shrink-0 mt-0.5">
                      <Star className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h5 className="text-[12px] font-bold text-gray-800 dark:text-gray-200">Reviews & Coupons</h5>
                      <p className="text-[10px] text-muted-foreground leading-normal">Customer feedback, product ratings, coupon usage, and expiry status.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-brand-green/[0.04] border border-brand-green/10 rounded-xl p-3.5 mt-2 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-brand-green/10 flex items-center justify-center">
                    <Bot className="h-4.5 w-4.5 text-brand-green" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[11px] font-bold text-brand-green">Pipeline Secured</p>
                    <span className="text-[9px] text-muted-foreground">Encryption TLS 1.3 Active</span>
                  </div>
                </div>

              </CardContent>
            </Card>

            <Card className="rounded-2xl border-white/40 bg-white/50 backdrop-blur-md shadow-lg p-5">
              <h4 className="font-bold text-[13px] text-gray-900 dark:text-white mb-2">Prompting Tips</h4>
              <ul className="list-disc list-inside text-[11px] text-muted-foreground space-y-1.5 leading-relaxed pl-1">
                <li>Ask: <em className="text-gray-700 font-medium">"show me customer Priya"</em> to pull up a specific customer.</li>
                <li>Ask: <em className="text-gray-700 font-medium">"orders for 9876543210"</em> to see a customer's order history.</li>
                <li>Ask: <em className="text-gray-700 font-medium">"monthly analytics"</em> for a full 30-day performance report.</li>
                <li>Ask: <em className="text-gray-700 font-medium">"pending orders list"</em> to see all undelivered orders.</li>
                <li>Ask: <em className="text-gray-700 font-medium">"show all coupons"</em> to review coupon usage and expiry.</li>
              </ul>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
