export function UniBusLogo({
  dark = true,
  size = 'md',
}: {
  dark?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const boxSize = size === 'sm' ? 'w-7 h-7 rounded-lg' : size === 'lg' ? 'w-9 h-9 rounded-xl' : 'w-8 h-8 rounded-lg';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <span className={`${boxSize} bg-[#FACC15] inline-flex items-center justify-center shrink-0`} aria-hidden="true">
        <span className="w-3 h-3 rounded-sm bg-[#111111]/15" />
      </span>
      <span className={`${textSize} font-extrabold tracking-tight ${dark ? 'text-white' : 'text-[#111111]'}`}>
        UniBus
      </span>
    </span>
  );
}
