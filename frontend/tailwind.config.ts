import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // Admin Design System Colors (keep existing)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Brand Design System Colors (public storefront)
        brand: {
          mustard: {
            DEFAULT: 'hsl(var(--brand-mustard))',
            dark: 'hsl(var(--brand-mustard-dark))',
          },
          brown: {
            DEFAULT: 'hsl(var(--brand-brown))',
            light: 'hsl(var(--brand-brown-light))',
          },
          green: {
            DEFAULT: 'hsl(var(--brand-green))',
            light: 'hsl(var(--brand-green-light))',
          },
          terracotta: 'hsl(var(--brand-terracotta))',
          cream: {
            DEFAULT: 'hsl(var(--brand-cream))',
            dark: 'hsl(var(--brand-cream-dark))',
          },
          sand: {
            DEFAULT: 'hsl(var(--brand-sand))',
            dark: 'hsl(var(--brand-sand-dark))',
          },
          charcoal: 'hsl(var(--brand-charcoal))',
          text: 'hsl(var(--brand-text))',
          muted: {
            DEFAULT: 'hsl(var(--brand-muted))',
            light: 'hsl(var(--brand-muted-light))',
          },
          border: {
            DEFAULT: 'hsl(var(--brand-border))',
            dark: 'hsl(var(--brand-border-dark))',
          },
          highlight: 'hsl(var(--brand-highlight))',
          success: 'hsl(var(--brand-success))',
          warning: 'hsl(var(--brand-warning))',
          error: 'hsl(var(--brand-error))',
        },
      },
      fontFamily: {
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
        body: ['var(--font-source-sans)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['4.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-md': ['2.5rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'display-sm': ['2rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        'body-xl': ['1.25rem', { lineHeight: '1.6' }],
        'body-lg': ['1.125rem', { lineHeight: '1.65' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        'ds-sm': 'var(--ds-radius-sm)',
        'ds-md': 'var(--ds-radius-md)',
        'ds-lg': 'var(--ds-radius-lg)',
        'ds-xl': 'var(--ds-radius-xl)',
      },
      boxShadow: {
        'ds-xs': 'var(--ds-shadow-xs)',
        'ds-sm': 'var(--ds-shadow-sm)',
        'ds-md': 'var(--ds-shadow-md)',
        'ds-lg': 'var(--ds-shadow-lg)',
        'ds-xl': 'var(--ds-shadow-xl)',
        // Brand shadows (warm tones)
        'brand-sm': '0 2px 8px -2px rgba(139, 90, 43, 0.1)',
        'brand-md': '0 4px 16px -4px rgba(139, 90, 43, 0.12)',
        'brand-lg': '0 8px 30px -8px rgba(139, 90, 43, 0.15)',
        'brand-xl': '0 20px 50px -12px rgba(139, 90, 43, 0.2)',
        'brand-inner': 'inset 0 2px 4px 0 rgba(139, 90, 43, 0.06)',
      },
      spacing: {
        'ds-1': 'var(--ds-space-1)',
        'ds-2': 'var(--ds-space-2)',
        'ds-3': 'var(--ds-space-3)',
        'ds-4': 'var(--ds-space-4)',
        'ds-5': 'var(--ds-space-5)',
        'ds-6': 'var(--ds-space-6)',
        'ds-8': 'var(--ds-space-8)',
        'ds-10': 'var(--ds-space-10)',
        'ds-12': 'var(--ds-space-12)',
        // Section spacing
        'section': '6rem',
        'section-lg': '8rem',
        'section-xl': '10rem',
      },
      height: {
        'screen-safe': '100dvh',
        'hero': 'calc(100vh - 80px)',
      },
      minHeight: {
        'screen-safe': '100dvh',
        'hero': 'calc(100vh - 80px)',
      },
      transitionTimingFunction: {
        'ds-out': 'var(--ds-ease-out)',
        'smooth': 'var(--ease-smooth)',
        'bounce': 'var(--ease-bounce)',
        'slow': 'var(--ease-slow)',
      },
      transitionDuration: {
        'ds-fast': 'var(--ds-duration-fast)',
        'ds-normal': 'var(--ds-duration-normal)',
        'ds-slow': 'var(--ds-duration-slow)',
        'instant': 'var(--duration-instant)',
        'fast': 'var(--duration-fast)',
        'normal': 'var(--duration-normal)',
        'slow': 'var(--duration-slow)',
        'slower': 'var(--duration-slower)',
        'cinematic': 'var(--duration-cinematic)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'count-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-down': {
          from: { opacity: '0', transform: 'translateY(-20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-30px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(30px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.35s var(--ds-ease-out) forwards',
        'count-up': 'count-up 0.3s var(--ds-ease-out) forwards',
        'fade-up': 'fade-up 0.6s var(--ease-smooth) forwards',
        'fade-down': 'fade-down 0.6s var(--ease-smooth) forwards',
        'scale-in': 'scale-in 0.4s var(--ease-smooth) forwards',
        'slide-in-left': 'slide-in-left 0.5s var(--ease-smooth) forwards',
        'slide-in-right': 'slide-in-right 0.5s var(--ease-smooth) forwards',
        'float': 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'spin-slow': 'spin-slow 8s linear infinite',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'brand-gradient': 'linear-gradient(135deg, hsl(var(--brand-mustard)) 0%, hsl(var(--brand-terracotta)) 100%)',
        'brand-gradient-soft': 'linear-gradient(180deg, hsl(var(--brand-cream)) 0%, hsl(var(--brand-sand)) 100%)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
