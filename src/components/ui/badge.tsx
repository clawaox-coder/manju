import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-brand-50 text-brand-700',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-border',
        success: 'bg-green-50 text-green-600',
        warning: 'bg-yellow-50 text-yellow-700',
        destructive: 'bg-red-50 text-red-600',
        gray: 'bg-muted text-muted-foreground'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
