// VIP: forest bg + gold-bright letter. Others: danger-track bg + danger letter.
// size ≤ 40 → full circle; size > 40 → square with radius proportional to size (14–18px)
interface CustomerAvatarProps {
  name?: string;
  isVip?: boolean;
  size?: number;
}

export function CustomerAvatar({ name, isVip, size = 38 }: CustomerAvatarProps) {
  const letter = ((name?.trim() || '?')[0]).toUpperCase();
  const isSquare = size > 40;
  const radius = isSquare ? Math.round(size * 0.27) : '50%';
  const fontSize = size >= 60 ? 26 : size >= 48 ? 20 : size >= 40 ? 17 : 14;

  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: isVip ? 'var(--crm-forest)' : 'var(--crm-danger-track)',
        color: isVip ? 'var(--crm-gold-bright)' : 'var(--crm-danger)',
        fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)',
        fontSize,
        fontWeight: 600,
      }}
      aria-hidden="true"
    >
      {letter}
    </div>
  );
}
