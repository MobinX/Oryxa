'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';
import { 
  Bot, 
  Inbox, 
  FolderTree, 
  BarChart3, 
  ArrowRight, 
  Check, 
  Menu, 
  X, 
  ChevronDown, 
  ShoppingBag,
  ShoppingCart
} from 'lucide-react';

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [whatsAppInput, setWhatsAppInput] = useState('');
  const [whatsAppChat, setWhatsAppChat] = useState([
    { id: 1, text: "Hi! I'd like to buy the black hoodie.", sender: 'customer', time: '10:22 AM' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Buy Now simulated checkout states
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [checkoutErrors, setCheckoutErrors] = useState<Record<string, string>>({});

  // Dynamic illustrative states
  const [revenueValue, setRevenueValue] = useState(24980);
  const [liveOrdersValue, setLiveOrdersValue] = useState(128);

  // AI Agent Chat history state
  const [agentChat, setAgentChat] = useState([
    { id: 1, text: "Do you have this hoodie in Medium?", sender: 'customer', time: '10:28 AM' },
    { id: 2, text: "Yes! We have this hoodie in Medium. Available in 3 colors.", sender: 'agent', time: '10:30 AM' }
  ]);

  // Floating plus ones micro-interaction
  const [floatingPlusOnes, setFloatingPlusOnes] = useState<{ id: number }[]>([]);

  // Book Demo Modal States
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    companyWebsite: '',
    companyEmail: '',
    employees: '',
    contactName: '',
    jobTitle: '',
    phone: '',
    country: '',
    industry: '',
    conversations: '< 1,000',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap & Escape listener for modal
  useEffect(() => {
    if (!demoModalOpen) return;

    const firstInput = modalRef.current?.querySelector('input');
    if (firstInput) {
      (firstInput as HTMLElement).focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDemoModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (!modalRef.current) return;

      const focusables = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex="0"]'
      );
      if (focusables.length === 0) return;
      
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleFocusTrap);

    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleFocusTrap);
      document.body.style.overflow = '';
    };
  }, [demoModalOpen]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.companyName.trim()) {
      newErrors.companyName = 'Company name is required';
    }
    if (!formData.contactName.trim()) {
      newErrors.contactName = 'Contact person name is required';
    }
    if (!formData.employees.trim()) {
      newErrors.employees = 'Number of employees is required';
    }
    if (!formData.companyEmail.trim()) {
      newErrors.companyEmail = 'Company email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.companyEmail)) {
      newErrors.companyEmail = 'Please enter a valid email address';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setDemoSubmitted(true);
  };

  // Handle adding product to cart
  const handleAddToCart = () => {
    setCartCount(prev => prev + 1);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 1550);

    // Smooth floating plus one micro-interaction
    const newId = Date.now();
    setFloatingPlusOnes(prev => [...prev, { id: newId }]);
    setTimeout(() => {
      setFloatingPlusOnes(prev => prev.filter(item => item.id !== newId));
    }, 800);
  };

  // Handle simulated Buy Now checkout submission
  const handleCheckoutConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!checkoutEmail.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!checkoutAddress.trim()) {
      newErrors.address = 'Shipping address is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setCheckoutErrors(newErrors);
      return;
    }

    setCheckoutErrors({});
    setCheckoutSuccess(true);
    setCartCount(prev => prev + 1);

    // Dynamic metrics animations
    setRevenueValue(prev => prev + 42);
    setLiveOrdersValue(prev => prev + 1);

    setTimeout(() => {
      setBuyNowOpen(false);
      setCheckoutSuccess(false);
      setCheckoutEmail('');
      setCheckoutAddress('');

      // Add confirmation reply from AI Agent!
      setAgentChat(prev => [
        ...prev,
        {
          id: Date.now(),
          text: `🎉 Order successful! A confirmation for Order #4082 has been sent to your email.`,
          sender: 'agent',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      ]);
    }, 1500);
  };

  // WhatsApp Chat Quick-Reply Simulator
  const handleWhatsAppSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsAppInput.trim()) return;

    const userMsg = {
      id: Date.now(),
      text: whatsAppInput,
      sender: 'customer',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setWhatsAppChat(prev => [...prev, userMsg]);
    setWhatsAppInput('');
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const agentMsg = {
        id: Date.now() + 1,
        text: "Sure! I can help with that. Let me look up the Essential Hoodie for you.",
        sender: 'agent',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setWhatsAppChat(prev => [...prev, agentMsg]);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-inter">
      {/* 1. Header / Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand Name */}
          <Link href="/" className="flex items-center gap-2 group">
            <svg viewBox="0 0 32 32" className="w-8 h-8 select-none">
              <defs>
                <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>
              <path
                d="M16 8C12 8 8 11.5 8 16s4 8 8 8c3 0 5-1.5 6.5-3.5L25 18c-2 2.5-5 4-9 4-6 0-11-4.5-11-10S10 2 16 2c4 0 7 1.5 9 4l-2.5 2.5C21 6.5 19 8 16 8zm0 16c4 0 8-3.5 8-8s-4-8-8-8c-3 0-5 1.5-6.5 3.5L11 14c2-2.5 5-4 9-4 6 0 11 4.5 11 10s-5 10-11 10c-4 0-7-1.5-9-4l2.5-2.5c1.5 2 3.5 3.5 6.5 3.5z"
                fill="url(#logo-grad)"
              />
            </svg>
            <span className="font-geist font-black text-xl tracking-tight text-foreground group-hover:opacity-90 transition-opacity">
              Oryxa
            </span>
          </Link>

          {/* Center Navigation Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/features" className="flex items-center gap-1 font-geist font-semibold text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer group">
              Features <ChevronDown className="h-4 w-4 stroke-[2] transition-transform group-hover:translate-y-0.5" />
            </Link>
            <Link href="/solutions" className="flex items-center gap-1 font-geist font-semibold text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer group">
              Solutions <ChevronDown className="h-4 w-4 stroke-[2] transition-transform group-hover:translate-y-0.5" />
            </Link>
            <button
              onClick={() => {
                const element = document.getElementById('pricing');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="font-geist font-semibold text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Pricing
            </button>
            <Link href="/developers" className="flex items-center gap-1 font-geist font-semibold text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer group">
              Developers <ChevronDown className="h-4 w-4 stroke-[2] transition-transform group-hover:translate-y-0.5" />
            </Link>
            <Link href="/docs" className="font-geist font-semibold text-sm text-muted-foreground hover:text-foreground transition-colors">
              Docs
            </Link>
          </nav>

          {/* Right Action Items (Desktop) */}
          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle />
            <Link 
              href="/login" 
              className="font-geist font-semibold text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/login"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-geist font-bold text-sm px-4.5 py-2.5 rounded-element transition-all active:scale-95 shadow-sm flex items-center gap-1.5"
            >
              Start Free <ArrowRight className="h-4 w-4 stroke-[2.5]" />
            </Link>
          </div>

          {/* Mobile Menu Actions */}
          <div className="flex items-center gap-3 md:hidden">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg border border-border/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border/40 bg-background px-4 pt-4 pb-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-5 duration-200">
            <div className="flex flex-col gap-3.5">
              <Link href="/features" className="font-geist font-semibold text-sm text-muted-foreground py-1.5 border-b border-border/10">Features</Link>
              <Link href="/solutions" className="font-geist font-semibold text-sm text-muted-foreground py-1.5 border-b border-border/10">Solutions</Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="font-geist font-semibold text-sm text-muted-foreground text-left py-1.5 border-b border-border/10 cursor-pointer animate-none"
              >
                Pricing
              </button>
              <Link href="/developers" className="font-geist font-semibold text-sm text-muted-foreground py-1.5 border-b border-border/10">Developers</Link>
              <Link href="/docs" className="font-geist font-semibold text-sm text-muted-foreground py-1.5 border-b border-border/10">Docs</Link>
            </div>
            <div className="flex items-center justify-between gap-4 mt-2">
              <Link 
                href="/login" 
                className="flex-1 text-center font-geist font-semibold text-sm text-muted-foreground hover:text-foreground py-2.5 rounded-element border border-border/40 hover:bg-muted transition-colors"
              >
                Login
              </Link>
              <Link
                href="/login"
                className="flex-1 text-center bg-primary hover:bg-primary/90 text-primary-foreground font-geist font-bold text-sm py-2.5 rounded-element transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                Start Free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <main className="relative min-h-[calc(100vh-4rem)] pt-8 pb-20 flex flex-col justify-center overflow-hidden">
        {/* Background Gradients & Glows (Tokyo Night Ambient style in Dark Mode) */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-violet-500/5 dark:bg-violet-500/10 blur-[120px] pointer-events-none -z-10" />
        <div className="absolute bottom-10 right-10 w-[300px] h-[300px] rounded-full bg-indigo-500/5 dark:bg-indigo-500/10 blur-[100px] pointer-events-none -z-10 animate-pulse duration-[10s]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center relative z-10">
            
            {/* Left Hero Column */}
            <div className="lg:col-span-6 flex flex-col gap-6 relative">
              
              {/* Floating Microsoft Sponsorship Card (Desktop) */}
              <div className="hidden xl:flex absolute -left-48 top-16 w-44 bg-card border border-border/50 rounded-card p-4 shadow-card flex-col gap-3 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="grid grid-cols-2 gap-0.5 w-5 h-5 shrink-0 select-none">
                    <div className="bg-[#F25022]" />
                    <div className="bg-[#7FBA00]" />
                    <div className="bg-[#00A4EF]" />
                    <div className="bg-[#FFB900]" />
                  </div>
                  <span className="font-geist font-bold text-[10px] tracking-wider text-muted-foreground uppercase leading-none">
                    Funded by
                  </span>
                </div>
                <div className="font-geist font-extrabold text-sm text-foreground leading-none">
                  Microsoft
                </div>
                <p className="font-inter text-[11px] text-muted-foreground leading-normal mt-0.5">
                  Backed by Microsoft for startups building the future of AI commerce.
                </p>
                <Link href="/login" className="font-geist font-bold text-[11px] text-[#6750a4] dark:text-[#cfbcff] hover:underline flex items-center gap-0.5 mt-1">
                  Learn more <ArrowRight className="h-3 w-3 stroke-[2.5]" />
                </Link>
              </div>

              {/* Mobile Microsoft Sponsorship Badge Inline */}
              <div className="xl:hidden flex items-center gap-2.5 self-start px-3.5 py-1.5 rounded-full border border-border/50 bg-card/50 text-xs font-semibold text-muted-foreground">
                <div className="grid grid-cols-2 gap-0.5 w-4 h-4 shrink-0 select-none">
                  <div className="bg-[#F25022]" />
                  <div className="bg-[#7FBA00]" />
                  <div className="bg-[#00A4EF]" />
                  <div className="bg-[#FFB900]" />
                </div>
                <span>Funded by <strong className="text-foreground">Microsoft</strong></span>
              </div>

              {/* AI Commerce Pill Badge */}
              <div className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-xs font-semibold font-geist border border-violet-500/20 bg-violet-500/10 text-[#6750a4] dark:text-[#cfbcff] tracking-wide select-none">
                <span className="text-sm">✨</span> AI Commerce Platform
              </div>

              {/* Main Headline */}
              <h1 className="font-geist text-4xl sm:text-5xl lg:text-5.5xl xl:text-6.5xl font-black tracking-tight leading-[1.05] text-foreground">
                Turn Conversations <br className="hidden sm:inline" />
                into <span className="bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">Customers</span> with AI
              </h1>

              {/* Sub-Headline */}
              <p className="font-inter text-base sm:text-[17px] text-muted-foreground leading-relaxed">
                Connect Facebook Messenger, Instagram, WhatsApp, and your online store into one AI-powered sales platform. Automate customer conversations, recommend products, process orders, and grow your business with intelligent commerce.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
                <Link
                  href="/login"
                  className="w-full sm:w-auto h-12 px-6 rounded-element bg-primary hover:bg-primary/95 text-primary-foreground font-geist font-bold text-sm tracking-wide shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  Start Free <ArrowRight className="h-4.5 w-4.5 stroke-[2.5]" />
                </Link>
                <button
                  type="button"
                  onClick={() => setDemoModalOpen(true)}
                  className="w-full sm:w-auto h-12 px-6 rounded-element border border-border/80 bg-card hover:bg-muted text-foreground font-geist font-bold text-sm tracking-wide shadow-sm hover:shadow active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Book Demo
                </button>
              </div>

              {/* Checklist */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-muted-foreground font-geist mt-1.5">
                <span className="flex items-center gap-1">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/10 text-[#6750a4] dark:text-[#cfbcff]">
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </div>
                  No credit card required
                </span>
                <span className="flex items-center gap-1">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/10 text-[#6750a4] dark:text-[#cfbcff]">
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </div>
                  Setup in under 5 minutes
                </span>
              </div>
            </div>

            {/* Right Hero Column (Illustration Dashboard Widgets) */}
            <div className="lg:col-span-6 flex items-center justify-center relative min-h-[480px] lg:min-h-[580px] mt-6 lg:mt-0 select-none">
              
              {/* Background Glass Plate */}
              <div className="absolute w-[440px] h-[440px] rounded-full border border-border/10 bg-gradient-to-tr from-violet-500/5 to-indigo-500/5 dark:from-violet-500/10 dark:to-indigo-500/10 blur-xl pointer-events-none -z-10" />

              {/* Floating Social Badges */}
              {/* Instagram top-right */}
              <div className="absolute right-8 top-0 w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FFB900] via-[#D81B60] to-[#8E24AA] shadow-card flex items-center justify-center text-white z-35 animate-float-slow">
                <svg viewBox="0 0 24 24" className="w-5.5 h-5.5 fill-none stroke-current stroke-[2]">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </div>

              {/* Messenger bottom-right */}
              <div className="absolute right-12 bottom-6 w-9 h-9 rounded-xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-card flex items-center justify-center text-white z-35 animate-float-gentle">
                <svg viewBox="0 0 24 24" className="w-5.5 h-5.5 fill-current">
                  <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.9 1.18 5.48 3.1 7.28.16.15.26.36.27.6l.04 1.95c.02.66.69 1.14 1.3.88l2.2-1c.2-.1.43-.08.62.03a10.3 10.3 0 0 0 2.47.3c5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm1 12.4l-2.6-2.8-5 2.8 5.4-5.8 2.6 2.8 5-2.8-5.4 5.8z" />
                </svg>
              </div>

              {/* WhatsApp bottom-left */}
              <div className="absolute left-6 bottom-48 w-11 h-11 rounded-xl bg-emerald-500 shadow-card flex items-center justify-center text-white z-35 animate-float-fast">
                <svg viewBox="0 0 24 24" className="w-6.5 h-6.5 fill-current">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.005 5.319 5.324.001 11.859.001A11.8 11.8 0 0 1 20.25 3.48a11.71 11.71 0 0 1 3.47 8.38c-.004 6.525-5.322 11.841-11.855 11.841-2.002-.001-3.972-.51-5.729-1.479L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.389 0 9.774-4.384 9.777-9.778.002-2.614-1.015-5.07-2.863-6.92A9.706 9.706 0 0 0 11.86 1.148c-5.39 0-9.777 4.387-9.78 9.782-.001 2.052.548 4.053 1.59 5.801l-.997 3.646 3.734-.98c1.556.85 3.013 1.258 4.73 1.258zm9.362-6.54c-.25-.124-1.477-.729-1.706-.812-.228-.084-.395-.124-.56.124-.166.25-.644.812-.79 1-.144.188-.29.208-.54.083-.25-.125-1.056-.39-2.012-1.243-.744-.664-1.247-1.484-1.393-1.734-.146-.25-.015-.385.11-.51.112-.112.25-.291.375-.437.125-.146.166-.25.25-.417.083-.166.042-.312-.02-.437-.063-.125-.56-1.354-.77-1.854-.2-.489-.4-.423-.55-.429h-.47c-.166 0-.437.063-.666.312-.229.25-.875.855-.875 2.083s.895 2.417.999 2.562c.104.146 1.76 2.688 4.265 3.771.596.257 1.062.41 1.424.525.6.19 1.145.163 1.577.099.48-.072 1.477-.604 1.685-1.187.208-.583.208-1.083.146-1.187-.063-.105-.229-.146-.479-.27z" />
                </svg>
              </div>

              {/* Main Mock Widget: AI Agent Chat */}
              <div className="w-[325px] bg-card border border-border/50 rounded-card shadow-card p-4.5 z-20 flex flex-col gap-4 relative overflow-hidden transition-all duration-300 hover:scale-[1.01] hover:shadow-xl dark:shadow-2xl min-h-[350px]">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/10 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-geist font-black text-sm flex items-center justify-center border border-primary/20">
                      AI
                    </div>
                    <div>
                      <h4 className="font-geist font-bold text-sm text-foreground leading-none">
                        AI Agent
                      </h4>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          Online
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simulated Checkout Form Overlay */}
                {buyNowOpen && (
                  <div className="absolute inset-0 bg-card/95 backdrop-blur-xs z-30 p-4.5 flex flex-col justify-between animate-in fade-in duration-200">
                    {!checkoutSuccess ? (
                      <form onSubmit={handleCheckoutConfirm} className="space-y-3.5 flex-1 flex flex-col justify-between">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="font-geist font-extrabold text-xs text-foreground uppercase tracking-wider">
                              Quick Checkout
                            </h5>
                            <button
                              type="button"
                              onClick={() => setBuyNowOpen(false)}
                              className="text-muted-foreground hover:text-foreground text-xs cursor-pointer font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                          
                          {/* Email Field */}
                          <div className="space-y-1">
                            <label htmlFor="checkoutEmail" className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block font-geist">
                              Email Address
                            </label>
                            <input
                              type="email"
                              id="checkoutEmail"
                              value={checkoutEmail}
                              onChange={(e) => {
                                setCheckoutEmail(e.target.value);
                                if (checkoutErrors.email) setCheckoutErrors(prev => ({ ...prev, email: '' }));
                              }}
                              placeholder="you@example.com"
                              className="bg-background border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none w-full"
                            />
                            {checkoutErrors.email && <p className="text-rose-500 text-[9px] font-medium">{checkoutErrors.email}</p>}
                          </div>

                          {/* Address Field */}
                          <div className="space-y-1">
                            <label htmlFor="checkoutAddress" className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block font-geist">
                              Shipping Address
                            </label>
                            <input
                              type="text"
                              id="checkoutAddress"
                              value={checkoutAddress}
                              onChange={(e) => {
                                setCheckoutAddress(e.target.value);
                                if (checkoutErrors.address) setCheckoutErrors(prev => ({ ...prev, address: '' }));
                              }}
                              placeholder="123 Main St, City"
                              className="bg-background border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none w-full"
                            />
                            {checkoutErrors.address && <p className="text-rose-500 text-[9px] font-medium">{checkoutErrors.address}</p>}
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="h-8 w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-geist font-bold text-[10px] uppercase tracking-wider transition-all duration-200 active:scale-95 flex items-center justify-center cursor-pointer shadow-sm shadow-emerald-500/10"
                        >
                          Confirm Purchase
                        </button>
                      </form>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 animate-in zoom-in-95 duration-200">
                        <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center animate-bounce">
                          <Check className="h-5 w-5 stroke-[3]" />
                        </div>
                        <h5 className="font-geist font-black text-sm text-foreground">
                          Order Placed!
                        </h5>
                        <p className="text-[10px] text-muted-foreground max-w-[180px]">
                          Your simulated order was created successfully.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Chat History */}
                <div className="flex flex-col gap-3.5 text-xs">
                  {agentChat.map(msg => (
                    <div 
                      key={msg.id} 
                      className={`max-w-[85%] px-3 py-2.5 rounded-[16px] relative leading-relaxed shadow-sm font-medium ${
                        msg.sender === 'customer' 
                          ? 'self-start bg-stone-150 dark:bg-stone-850 text-foreground rounded-tl-sm' 
                          : 'self-end bg-[#6750a4]/10 dark:bg-[#cfbcff]/10 text-foreground rounded-tr-sm border border-[#6750a4]/10 dark:border-[#cfbcff]/15'
                      }`}
                    >
                      {msg.text}
                      <span className="block text-[8px] text-muted-foreground mt-1 text-right">{msg.time}</span>
                    </div>
                  ))}

                  {/* Product Display Card inside chat */}
                  <div className="self-end w-[90%] border border-border/50 bg-card rounded-xl p-2.5 shadow-sm flex items-center gap-3">
                    <div className="h-14 w-14 rounded-lg bg-stone-100 overflow-hidden shrink-0 relative border border-border/30">
                      <Image
                        src="/images/essential-hoodie.jpg"
                        alt="Essential Hoodie"
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="font-geist font-extrabold text-[11px] text-foreground truncate">
                        Essential Hoodie
                      </h5>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium truncate">
                        Medium • Black
                      </p>
                      <p className="font-geist font-black text-xs text-foreground mt-1">
                        $42.00
                      </p>
                    </div>
                  </div>

                  {/* Buy/Add Buttons */}
                  <div className="self-end w-[90%] flex items-center gap-2 mt-1 relative">
                    {floatingPlusOnes.map((item, idx) => (
                      <span
                        key={item.id}
                        className="absolute text-emerald-500 font-geist font-black text-xs animate-float-up pointer-events-none z-40"
                        style={{ left: '25%', top: '-20px' }}
                      >
                        +1
                      </span>
                    ))}
                    <button
                      onClick={handleAddToCart}
                      className={`flex-1 h-8 rounded-lg font-geist font-bold text-[10px] uppercase tracking-wider transition-all duration-200 active:scale-95 flex items-center justify-center gap-1 cursor-pointer ${
                        addedToCart 
                          ? 'bg-emerald-500 text-white shadow-emerald-500/10' 
                          : 'bg-primary text-primary-foreground shadow-sm hover:opacity-95'
                      }`}
                    >
                      {addedToCart ? <Check className="h-3.5 w-3.5" /> : 'Add to cart'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuyNowOpen(true)}
                      className="flex-1 h-8 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center cursor-pointer"
                    >
                      Buy now
                    </button>
                  </div>
                </div>
              </div>

              {/* Floating Widget 1: Total Revenue (top-right) */}
              <div className="absolute -right-6 top-6 w-[235px] bg-card border border-border/50 rounded-card shadow-card p-4 z-30 animate-float-slow transition-all duration-300 hover:shadow-xl dark:shadow-2xl">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block font-geist">
                  Total Revenue
                </span>
                <h3 className="font-geist font-black text-2xl text-foreground mt-1 leading-none">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(revenueValue)}
                </h3>
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1.5">
                  ↑ 24.5% <span className="text-muted-foreground font-medium ml-1">vs last month</span>
                </span>
                {/* SVG wave chart */}
                <div className="w-full h-11 mt-3 opacity-90">
                  <svg className="w-full h-full" viewBox="0 0 100 30" fill="none">
                    <path
                      d="M5 25C20 22 25 15 40 18C55 20 60 8 75 10C90 12 95 3 110 3"
                      stroke="#8B5CF6"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              {/* Floating Widget 2: Live Orders (bottom-right / middle-right) */}
              <div className="absolute -right-12 bottom-32 w-[170px] bg-card border border-border/50 rounded-card shadow-card p-3.5 z-25 animate-float-fast transition-all duration-300 hover:shadow-xl dark:shadow-2xl">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block font-geist">
                  Live Orders
                </span>
                <h3 className="font-geist font-black text-2xl text-foreground mt-1 leading-none">
                  {liveOrdersValue}
                </h3>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block mt-1.5">
                  New orders ↑ 18%
                </span>
                {/* Mini bar chart */}
                <div className="flex items-end justify-between h-8.5 mt-3 px-1">
                  <div className="w-2.5 h-3 bg-primary/20 dark:bg-primary/30 rounded-t" />
                  <div className="w-2.5 h-5 bg-primary/35 dark:bg-primary/45 rounded-t animate-pulse" />
                  <div className="w-2.5 h-4 bg-primary/25 dark:bg-primary/35 rounded-t" />
                  <div className="w-2.5 h-7.5 bg-primary/50 dark:bg-primary/60 rounded-t" />
                  <div className="w-2.5 h-6 bg-primary/40 dark:bg-primary/50 rounded-t" />
                  <div className="w-2.5 h-8 bg-primary rounded-t" />
                </div>
              </div>

              {/* Floating Widget 3: Top Products (far-right - hidden on small viewports) */}
              <div className="absolute -right-22 top-40 w-[205px] bg-card border border-border/50 rounded-card shadow-card p-3.5 z-10 hidden xl:flex flex-col gap-2.5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl dark:shadow-2xl">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block font-geist">
                  Top Products
                </span>
                <div className="flex flex-col gap-2 mt-1">
                  {/* Product 1 */}
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-stone-100 overflow-hidden relative shrink-0 border border-border/20">
                      <Image
                        src="/images/essential-hoodie.jpg"
                        alt="Essential Hoodie"
                        fill
                        className="object-cover"
                        sizes="32px"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h6 className="font-geist font-bold text-[10px] text-foreground truncate">
                        Essential Hoodie
                      </h6>
                      <p className="text-[8px] text-muted-foreground font-medium truncate mt-0.5">
                        1,245 orders
                      </p>
                    </div>
                  </div>
                  {/* Product 2 */}
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-stone-100 overflow-hidden relative shrink-0 border border-border/20">
                      <Image
                        src="/images/minimal-tshirt.jpg"
                        alt="Minimal T-Shirt"
                        fill
                        className="object-cover"
                        sizes="32px"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h6 className="font-geist font-bold text-[10px] text-foreground truncate">
                        Minimal T-Shirt
                      </h6>
                      <p className="text-[8px] text-muted-foreground font-medium truncate mt-0.5">
                        1,032 orders
                      </p>
                    </div>
                  </div>
                  {/* Product 3 */}
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-stone-100 overflow-hidden relative shrink-0 border border-border/20">
                      <Image
                        src="/images/premium-cap.jpg"
                        alt="Cap Premium"
                        fill
                        className="object-cover"
                        sizes="32px"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h6 className="font-geist font-bold text-[10px] text-foreground truncate">
                        Cap Premium
                      </h6>
                      <p className="text-[8px] text-muted-foreground font-medium truncate mt-0.5">
                        832 orders
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating WhatsApp Widget (bottom-left) */}
              <div className="absolute -left-6 bottom-8 w-[250px] bg-card border border-border/50 rounded-card shadow-card p-4.5 z-30 animate-float-gentle transition-all duration-300 hover:shadow-xl dark:shadow-2xl">
                {/* Widget Header */}
                <div className="flex items-center gap-2 border-b border-border/10 pb-2 mb-2.5">
                  <div className="h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center select-none">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                      <path d="M.057 24l1.687-6.163C.703 16.033.156 13.988.157 11.891.165 5.319 5.484.001 12.019.001A12 12 0 0 1 20.41 3.48a11.71 11.71 0 0 1 3.47 8.38c-.004 6.525-5.322 11.841-11.855 11.841-2.002-.001-3.972-.51-5.729-1.479L0 24z" />
                    </svg>
                  </div>
                  <div>
                    <h5 className="font-geist font-bold text-[10px] text-foreground leading-none">
                      WhatsApp
                    </h5>
                    <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5">
                      Business
                    </span>
                  </div>
                </div>

                {/* WhatsApp Chat list */}
                <div className="flex flex-col gap-2.5 max-h-[140px] overflow-y-auto pb-1 text-[11px] font-medium pr-0.5">
                  {whatsAppChat.map(msg => (
                    <div 
                      key={msg.id} 
                      className={`max-w-[85%] px-3 py-2 rounded-xl relative leading-relaxed shadow-sm ${
                        msg.sender === 'customer' 
                          ? 'self-start bg-stone-150 dark:bg-stone-800 text-foreground rounded-tl-xs' 
                          : 'self-end bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/20 text-foreground rounded-tr-xs'
                      }`}
                    >
                      {msg.text}
                      <span className="block text-[7.5px] text-muted-foreground mt-0.5 text-right">{msg.time}</span>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="self-end bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/20 px-3 py-2 rounded-xl text-muted-foreground flex items-center gap-1 select-none animate-pulse">
                      <span className="h-1 w-1 bg-muted-foreground rounded-full animate-bounce" />
                      <span className="h-1 w-1 bg-muted-foreground rounded-full animate-bounce delay-100" />
                      <span className="h-1 w-1 bg-muted-foreground rounded-full animate-bounce delay-200" />
                    </div>
                  )}
                </div>

                {/* Input simulator */}
                <form onSubmit={handleWhatsAppSend} className="flex gap-1.5 mt-3 border-t border-border/10 pt-2.5">
                  <input
                    type="text"
                    value={whatsAppInput}
                    onChange={(e) => setWhatsAppInput(e.target.value)}
                    placeholder="Type to reply..."
                    className="flex-1 h-7.5 px-2.5 rounded-lg border border-border/80 bg-background text-[11px] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground/60"
                  />
                  <button 
                    type="submit"
                    className="h-7.5 px-3 bg-emerald-500 text-white rounded-lg text-[10px] font-geist font-bold uppercase hover:bg-emerald-600 transition-colors active:scale-95"
                  >
                    Send
                  </button>
                </form>
              </div>

              {/* Floating Glass Shopping Cart (bottom-right overlap) */}
              <div className="absolute -left-12 bottom-56 w-12 h-12 rounded-2xl bg-card border border-border/60 shadow-card flex items-center justify-center text-primary z-30 animate-float-slow hover:scale-115 active:scale-95 transition-all cursor-pointer">
                <div className="relative">
                  <ShoppingCart className="h-5 w-5 stroke-[2]" />
                  {cartCount > 0 && (
                    <span className="absolute -top-2.5 -right-2.5 bg-rose-500 text-white font-geist font-extrabold text-[9px] h-4.5 w-4.5 rounded-full flex items-center justify-center border-2 border-card animate-bounce">
                      {cartCount}
                    </span>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      {/* 3. Trusted Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 text-center select-none border-t border-border/25">
        <h3 className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-8 font-geist">
          Trusted by modern commerce teams
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-7 md:gap-x-16 opacity-55 hover:opacity-100 transition-opacity duration-300">
          
          {/* Acme Corp */}
          <div className="flex items-center gap-1.5 font-geist font-black text-stone-600 dark:text-stone-300 text-sm tracking-tight">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M12 2L2 22h20L12 2zm0 3.8L18.7 19H5.3L12 5.8z" />
            </svg>
            <span>Acme Corp</span>
          </div>

          {/* Automattic */}
          <div className="font-geist font-light text-stone-600 dark:text-stone-300 text-base tracking-wide lowercase">
            automattic
          </div>

          {/* Tailwind Labs */}
          <div className="flex items-center gap-1.5 font-geist font-bold text-stone-600 dark:text-stone-300 text-sm tracking-tight">
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-current">
              <path d="M12.001 4.8c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C13.666 10.618 15.027 12 18.001 12c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C16.337 6.182 14.976 4.8 12.001 4.8zm-6 7.2c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C7.666 17.818 9.027 19 12.001 19c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C10.337 13.382 8.976 12 6.001 12z" />
            </svg>
            <span>Tailwind Labs</span>
          </div>

          {/* Zapier */}
          <div className="flex items-center gap-1 font-geist font-black text-stone-600 dark:text-stone-300 text-sm tracking-tight">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#FF4A00]">
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span>_zapier</span>
          </div>

          {/* Growthbar */}
          <div className="flex items-center gap-1.5 font-geist font-bold text-stone-600 dark:text-stone-300 text-sm tracking-tight">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <rect x="3" y="12" width="4" height="8" rx="1" />
              <rect x="10" y="8" width="4" height="12" rx="1" />
              <rect x="17" y="4" width="4" height="16" rx="1" />
            </svg>
            <span>growthbar</span>
          </div>

          {/* Shippo */}
          <div className="flex items-center gap-1 font-geist font-black text-stone-600 dark:text-stone-300 text-sm tracking-tight">
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-current">
              <path d="M2 17h12l-4-5h12l-8-10z" />
            </svg>
            <span>shippo</span>
          </div>
        </div>
      </section>

      {/* 4. Features Cards Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card 1: AI Sales Agent */}
          <div className="bg-card border border-border/50 rounded-card p-6 shadow-card hover:scale-[1.02] hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] transition-all duration-300 relative flex flex-col justify-between min-h-[190px] group">
            <div className="flex flex-col gap-4">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center select-none border border-violet-500/10">
                <Bot className="h-5.5 w-5.5 stroke-[1.75]" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-geist font-extrabold text-base text-foreground">
                  AI Sales Agent
                </h4>
                <p className="font-inter text-xs text-muted-foreground leading-relaxed">
                  AI replies instantly, recommends products, and closes more sales.
                </p>
              </div>
            </div>
            <div className="self-end mt-4">
              <div className="w-8 h-8 rounded-full border border-violet-500/20 bg-violet-500/5 group-hover:bg-violet-500 group-hover:text-white flex items-center justify-center text-violet-600 dark:text-violet-400 transition-all duration-300">
                <ArrowRight className="h-4 w-4 stroke-[2]" />
              </div>
            </div>
          </div>

          {/* Card 2: Omnichannel Inbox */}
          <div className="bg-card border border-border/50 rounded-card p-6 shadow-card hover:scale-[1.02] hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] transition-all duration-300 relative flex flex-col justify-between min-h-[190px] group">
            <div className="flex flex-col gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center select-none border border-blue-500/10">
                <Inbox className="h-5.5 w-5.5 stroke-[1.75]" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-geist font-extrabold text-base text-foreground">
                  Omnichannel Inbox
                </h4>
                <p className="font-inter text-xs text-muted-foreground leading-relaxed">
                  Manage all conversations from Messenger, Instagram & WhatsApp.
                </p>
              </div>
            </div>
            <div className="self-end mt-4">
              <div className="w-8 h-8 rounded-full border border-blue-500/20 bg-blue-500/5 group-hover:bg-blue-500 group-hover:text-white flex items-center justify-center text-blue-600 dark:text-blue-400 transition-all duration-300">
                <ArrowRight className="h-4 w-4 stroke-[2]" />
              </div>
            </div>
          </div>

          {/* Card 3: Product Catalog */}
          <div className="bg-card border border-border/50 rounded-card p-6 shadow-card hover:scale-[1.02] hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] transition-all duration-300 relative flex flex-col justify-between min-h-[190px] group">
            <div className="flex flex-col gap-4">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center select-none border border-rose-500/10">
                <ShoppingBag className="h-5.5 w-5.5 stroke-[1.75]" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-geist font-extrabold text-base text-foreground">
                  Product Catalog
                </h4>
                <p className="font-inter text-xs text-muted-foreground leading-relaxed">
                  Import once, auto-sync across all channels in real time.
                </p>
              </div>
            </div>
            <div className="self-end mt-4">
              <div className="w-8 h-8 rounded-full border border-rose-500/20 bg-rose-500/5 group-hover:bg-rose-500 group-hover:text-white flex items-center justify-center text-rose-600 dark:text-rose-400 transition-all duration-300">
                <ArrowRight className="h-4 w-4 stroke-[2]" />
              </div>
            </div>
          </div>

          {/* Card 4: Powerful Analytics */}
          <div className="bg-card border border-border/50 rounded-card p-6 shadow-card hover:scale-[1.02] hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] transition-all duration-300 relative flex flex-col justify-between min-h-[190px] group">
            <div className="flex flex-col gap-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center select-none border border-emerald-500/10">
                <BarChart3 className="h-5.5 w-5.5 stroke-[1.75]" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-geist font-extrabold text-base text-foreground">
                  Powerful Analytics
                </h4>
                <p className="font-inter text-xs text-muted-foreground leading-relaxed">
                  Track sales, conversations and AI performance in one place.
                </p>
              </div>
            </div>
            <div className="self-end mt-4">
              <div className="w-8 h-8 rounded-full border border-emerald-500/20 bg-emerald-500/5 group-hover:bg-emerald-500 group-hover:text-white flex items-center justify-center text-emerald-600 dark:text-emerald-400 transition-all duration-300">
                <ArrowRight className="h-4 w-4 stroke-[2]" />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 5. Pricing Section */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 border-t border-border/25 relative scroll-mt-16">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-violet-600/5 dark:bg-violet-600/10 blur-[100px] pointer-events-none -z-10 animate-pulse duration-[8s]" />

        <div className="text-center space-y-3 mb-16">
          <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest font-geist">
            Simple, Transparent Pricing
          </span>
          <h2 className="font-geist font-black text-3xl sm:text-4.5xl text-foreground tracking-tight leading-none">
            Choose the Perfect Plan for Your Business Scale
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto font-inter">
            Grounded pricing designed to grow with your commerce store. Start building AI agents today.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Starter Plan */}
          <div className="bg-card border border-border/50 rounded-card p-8 shadow-card flex flex-col justify-between hover:scale-[1.01] hover:shadow-lg active:scale-[0.99] transition-all duration-300 relative overflow-hidden group">
            <div className="space-y-6">
              <div className="space-y-2">
                <h4 className="font-geist font-extrabold text-lg text-foreground">Starter</h4>
                <p className="text-xs text-muted-foreground font-medium font-inter">For early-stage shops starting with AI auto-replies.</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-geist font-black text-4xl text-foreground">$29</span>
                <span className="text-xs text-muted-foreground font-semibold">/month</span>
              </div>
              <ul className="space-y-3.5 text-xs text-muted-foreground font-medium font-inter border-t border-border/10 pt-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Up to 1,000 monthly conversations
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  1 Platform Channel connection
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Standard AI auto-reply agent
                </li>
                <li className="flex items-center gap-2 text-muted-foreground/50 line-through">
                  Advanced custom analytics
                </li>
                <li className="flex items-center gap-2 text-muted-foreground/50 line-through">
                  24/7 dedicated support
                </li>
              </ul>
            </div>
            <Link
              href="/login"
              className="mt-8 h-11 w-full rounded-element border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-xs uppercase tracking-wider shadow-sm hover:shadow flex items-center justify-center transition-all active:scale-95"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Pro Plan */}
          <div className="bg-card border-2 border-primary/45 rounded-card p-8 shadow-card dark:shadow-[0_0_40px_rgba(139,92,246,0.08)] flex flex-col justify-between hover:scale-[1.01] hover:shadow-lg active:scale-[0.99] transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground font-geist font-bold text-[9px] uppercase tracking-wider px-3.5 py-1.5 rounded-bl-xl shadow-sm">
              Popular
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <h4 className="font-geist font-extrabold text-lg text-foreground">Pro</h4>
                <p className="text-xs text-muted-foreground font-medium font-inter">For fast-growing commerce brands scaling automation.</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-geist font-black text-4xl text-foreground">$79</span>
                <span className="text-xs text-muted-foreground font-semibold">/month</span>
              </div>
              <ul className="space-y-3.5 text-xs text-muted-foreground font-medium font-inter border-t border-border/10 pt-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Up to 10,000 monthly conversations
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  All Platform Channels included
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Advanced fine-tuned AI Agent
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Custom dashboard analytics
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Priority 24/7 client support
                </li>
              </ul>
            </div>
            <Link
              href="/login"
              className="mt-8 h-11 w-full rounded-element bg-primary hover:bg-primary/95 text-primary-foreground font-geist font-bold text-xs uppercase tracking-wider shadow-sm flex items-center justify-center transition-all active:scale-95"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Enterprise Plan */}
          <div className="bg-card border border-border/50 rounded-card p-8 shadow-card flex flex-col justify-between hover:scale-[1.01] hover:shadow-lg active:scale-[0.99] transition-all duration-300 relative overflow-hidden group">
            <div className="space-y-6">
              <div className="space-y-2">
                <h4 className="font-geist font-extrabold text-lg text-foreground">Enterprise</h4>
                <p className="text-xs text-muted-foreground font-medium font-inter">For large-scale volume and customized requirements.</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-geist font-black text-4.5xl text-foreground">Custom</span>
              </div>
              <ul className="space-y-3.5 text-xs text-muted-foreground font-medium font-inter border-t border-border/10 pt-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Unlimited monthly conversations
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Dedicated database instance
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Custom trained AI model SLA
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Custom API & webhook endpoints
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  Dedicated Technical Account Manager
                </li>
              </ul>
            </div>
            <button
              onClick={() => setDemoModalOpen(true)}
              className="mt-8 h-11 w-full rounded-element border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-xs uppercase tracking-wider shadow-sm hover:shadow flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            >
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="border-t border-border/25 bg-card/30 dark:bg-card/15 py-12 lg:py-16 text-xs text-muted-foreground font-geist relative select-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">
          {/* Col 1 */}
          <div className="md:col-span-4 space-y-4">
            <Link href="/" className="flex items-center gap-2 group self-start">
              <svg viewBox="0 0 32 32" className="w-8 h-8 select-none">
                <defs>
                  <linearGradient id="logo-grad-foot" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8B5CF6" />
                    <stop offset="100%" stopColor="#6366F1" />
                  </linearGradient>
                </defs>
                <path
                  d="M16 8C12 8 8 11.5 8 16s4 8 8 8c3 0 5-1.5 6.5-3.5L25 18c-2 2.5-5 4-9 4-6 0-11-4.5-11-10S10 2 16 2c4 0 7 1.5 9 4l-2.5 2.5C21 6.5 19 8 16 8zm0 16c4 0 8-3.5 8-8s-4-8-8-8c-3 0-5 1.5-6.5 3.5L11 14c2-2.5 5-4 9-4 6 0 11 4.5 11 10s-5 10-11 10c-4 0-7-1.5-9-4l2.5-2.5c1.5 2 3.5 3.5 6.5 3.5z"
                  fill="url(#logo-grad-foot)"
                />
              </svg>
              <span className="font-geist font-black text-xl tracking-tight text-foreground group-hover:opacity-90 transition-opacity">
                Oryxa
              </span>
            </Link>
            <p className="font-inter text-muted-foreground leading-relaxed text-xs">
              Automating customer support and product sales on WhatsApp, Instagram, and Messenger with intelligent, custom-trained AI agents.
            </p>
          </div>

          {/* Col 2 */}
          <div className="md:col-span-2.5 space-y-3.5">
            <h5 className="font-geist font-extrabold text-[10px] uppercase tracking-wider text-foreground">Product</h5>
            <div className="flex flex-col gap-2">
              <Link href="/features" className="hover:text-foreground transition-colors font-medium">Features</Link>
              <Link href="/solutions" className="hover:text-foreground transition-colors font-medium">Solutions</Link>
              <button 
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                className="hover:text-foreground transition-colors font-medium text-left cursor-pointer"
              >
                Pricing
              </button>
            </div>
          </div>

          {/* Col 3 */}
          <div className="md:col-span-2.5 space-y-3.5">
            <h5 className="font-geist font-extrabold text-[10px] uppercase tracking-wider text-foreground">Resources</h5>
            <div className="flex flex-col gap-2">
              <Link href="/developers" className="hover:text-foreground transition-colors font-medium">Developers</Link>
              <Link href="/docs" className="hover:text-foreground transition-colors font-medium">Docs</Link>
            </div>
          </div>

          {/* Col 4 */}
          <div className="md:col-span-3 space-y-3.5">
            <h5 className="font-geist font-extrabold text-[10px] uppercase tracking-wider text-foreground">Legal & Support</h5>
            <div className="flex flex-col gap-2">
              <Link href="/privacy" className="hover:text-foreground transition-colors font-medium">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors font-medium">Terms & Conditions</Link>
              <button 
                onClick={() => setDemoModalOpen(true)}
                className="hover:text-foreground transition-colors font-medium text-left cursor-pointer"
              >
                Contact
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-border/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 font-inter text-[11px]">
          <div>© 2026 Oryxa. All rights reserved.</div>
          <div className="flex items-center gap-6">
            <span className="hover:text-foreground transition-colors cursor-pointer">Twitter</span>
            <span className="hover:text-foreground transition-colors cursor-pointer">GitHub</span>
            <span className="hover:text-foreground transition-colors cursor-pointer">LinkedIn</span>
          </div>
        </div>
      </footer>

      {/* Book Demo Modal */}
      {demoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/65 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in">
          <div 
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="w-full max-w-2xl bg-card border border-border/65 rounded-card shadow-card dark:shadow-[0_0_50px_rgba(139,92,246,0.12)] p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setDemoModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg border border-border/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>

            {!demoSubmitted ? (
              <form onSubmit={handleDemoSubmit} className="space-y-5">
                <div>
                  <h2 id="modal-title" className="font-geist font-black text-2xl text-foreground">
                    Request a Demo
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Experience the power of AI-driven commerce auto-reply. Fill out the form below and our team will get in touch with you.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Contact Person Name */}
                  <div>
                    <label htmlFor="contactName" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Contact Person Name *
                    </label>
                    <input
                      type="text"
                      id="contactName"
                      name="contactName"
                      value={formData.contactName}
                      onChange={handleFormChange}
                      className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full"
                    />
                    {errors.contactName && <p className="text-rose-500 text-xs mt-1 font-medium font-inter">{errors.contactName}</p>}
                  </div>

                  {/* Job Title */}
                  <div>
                    <label htmlFor="jobTitle" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Job Title
                    </label>
                    <input
                      type="text"
                      id="jobTitle"
                      name="jobTitle"
                      value={formData.jobTitle}
                      onChange={handleFormChange}
                      className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full"
                    />
                  </div>

                  {/* Company Name */}
                  <div>
                    <label htmlFor="companyName" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      id="companyName"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleFormChange}
                      className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full"
                    />
                    {errors.companyName && <p className="text-rose-500 text-xs mt-1 font-medium font-inter">{errors.companyName}</p>}
                  </div>

                  {/* Company Website */}
                  <div>
                    <label htmlFor="companyWebsite" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Company Website
                    </label>
                    <input
                      type="text"
                      id="companyWebsite"
                      name="companyWebsite"
                      value={formData.companyWebsite}
                      onChange={handleFormChange}
                      className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full"
                    />
                  </div>

                  {/* Company Email */}
                  <div>
                    <label htmlFor="companyEmail" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Company Email *
                    </label>
                    <input
                      type="text"
                      id="companyEmail"
                      name="companyEmail"
                      value={formData.companyEmail}
                      onChange={handleFormChange}
                      className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full"
                    />
                    {errors.companyEmail && <p className="text-rose-500 text-xs mt-1 font-medium font-inter">{errors.companyEmail}</p>}
                  </div>

                  {/* Number of Employees */}
                  <div>
                    <label htmlFor="employees" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Number of Employees *
                    </label>
                    <input
                      type="number"
                      id="employees"
                      name="employees"
                      value={formData.employees}
                      onChange={handleFormChange}
                      className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full"
                    />
                    {errors.employees && <p className="text-rose-500 text-xs mt-1 font-medium font-inter">{errors.employees}</p>}
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label htmlFor="phone" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleFormChange}
                      className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full"
                    />
                  </div>

                  {/* Country */}
                  <div>
                    <label htmlFor="country" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Country
                    </label>
                    <input
                      type="text"
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleFormChange}
                      className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full"
                    />
                  </div>

                  {/* Industry */}
                  <div>
                    <label htmlFor="industry" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Industry
                    </label>
                    <input
                      type="text"
                      id="industry"
                      name="industry"
                      value={formData.industry}
                      onChange={handleFormChange}
                      className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full"
                    />
                  </div>

                  {/* Expected Monthly Conversations */}
                  <div>
                    <label htmlFor="conversations" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                      Expected Monthly Conversations
                    </label>
                    <div className="relative">
                      <select
                        id="conversations"
                        name="conversations"
                        value={formData.conversations}
                        onChange={handleFormChange}
                        className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full cursor-pointer appearance-none"
                      >
                        <option value="< 1,000">&lt; 1,000</option>
                        <option value="1,000 - 10,000">1,000 - 10,000</option>
                        <option value="10,000 - 50,000">10,000 - 50,000</option>
                        <option value="50,000+">50,000+</option>
                      </select>
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                        <ChevronDown className="h-4 w-4 stroke-[2]" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Notes */}
                <div>
                  <label htmlFor="notes" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block font-geist">
                    Additional Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    value={formData.notes}
                    onChange={handleFormChange}
                    className="bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none transition-colors duration-200 w-full resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/10">
                  <button
                    type="button"
                    onClick={() => setDemoModalOpen(false)}
                    className="h-10 px-4.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-10 px-5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-geist font-bold text-xs uppercase tracking-wider shadow-sm hover:opacity-95 transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    Request Demo
                  </button>
                </div>
              </form>
            ) : (
              <div className="py-8 flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center animate-bounce">
                  <Check className="h-8 w-8 stroke-[3]" />
                </div>
                <h2 className="font-geist font-black text-2xl text-foreground mt-2">
                  Demo Request Submitted!
                </h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Thank you for requesting a demo of Oryxa. Our sales team will reach out to you shortly to schedule your session.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDemoModalOpen(false);
                    setDemoSubmitted(false);
                    setFormData({
                      companyName: '',
                      companyWebsite: '',
                      companyEmail: '',
                      employees: '',
                      contactName: '',
                      jobTitle: '',
                      phone: '',
                      country: '',
                      industry: '',
                      conversations: '< 1,000',
                      notes: '',
                    });
                  }}
                  className="h-10 px-6 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-geist font-bold text-xs uppercase tracking-wider transition-all mt-4 cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
