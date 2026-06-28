import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] hover:[will-change:transform]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 transition-[background-color,opacity,transform] duration-100 ease-out',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-[background-color,opacity,transform] duration-100 ease-out',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-[background-color,color,transform] duration-100 ease-out',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-[background-color,opacity,transform] duration-100 ease-out',
        ghost: 'hover:bg-accent hover:text-accent-foreground transition-[background-color,color,transform] duration-100 ease-out',
        link: 'text-primary underline-offset-4 hover:underline transition-none',
        brand:
          'bg-brand-mustard text-white hover:bg-brand-mustard-dark hover:shadow-[0_4px_16px_rgba(0,0,0,0.18)] active:shadow-none rounded-xl font-medium transition-[background-color,transform,box-shadow] duration-150 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]',
        'brand-dark':
          'bg-brand-charcoal text-white hover:bg-brand-charcoal-dark hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:shadow-none rounded-full font-medium transition-[background-color,transform,box-shadow] duration-150 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]',
        'brand-outline':
          'border-2 border-brand-charcoal text-brand-charcoal hover:bg-brand-charcoal hover:text-white rounded-full font-medium transition-[background-color,color,transform,border-color] duration-150 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        xl: 'h-12 rounded-xl px-8 py-3',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
