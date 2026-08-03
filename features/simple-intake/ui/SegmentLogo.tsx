/**
 * Segment wordmark for app chrome (visual top-right in RTL headers).
 */

export function SegmentLogo({
  className = "h-[35px] w-auto sm:h-10",
}: {
  className?: string;
}) {
  return (
    <img
      src="/segment-logo.svg"
      alt="סגמנט"
      className={className}
      draggable={false}
    />
  );
}
