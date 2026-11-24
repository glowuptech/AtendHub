import type { ComponentProps } from "react";

export default function Image({
  unoptimized,
  alt = "",
  ...props
}: ComponentProps<"img"> & { unoptimized?: boolean }) {
  void unoptimized;
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} {...props} />;
}
