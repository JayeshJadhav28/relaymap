/**
 * RelayMap logo mark.
 *
 * A node-to-node relay path with a handover arrow. The mark uses currentColor so
 * it inherits the surrounding brand colour and works on light or dark surfaces.
 */
export function LogoMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="5.5" cy="16" r="2.6" fill="currentColor" />
      <path
        d="M8.2 16h2.6c3.2 0 3.2-8 6.4-8h1.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M15.8 5.6 18.8 8l-3 2.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
