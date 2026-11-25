import type { ComponentProps } from "react";

type ImageProps = ComponentProps<"img"> & { unoptimized?: boolean };

export default function Image({
  unoptimized: _unoptimized,
  alt,
  ...props
}: ImageProps) {
  // eslint-disable-next-line @next/next/no-img-element -- The isolated harness runs without Next.js.
  return <img alt={alt} {...props} />;
}
