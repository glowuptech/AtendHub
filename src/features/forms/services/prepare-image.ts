/** Prepare a browser upload for the existing versioned Data URL storage. */
export async function prepareFormImage(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10000000
  )
    throw new Error("Escolha uma imagem PNG, JPEG ou WebP de até 10 MB.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Não foi possível ler a imagem."));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("O arquivo não pôde ser aberto como imagem."));
    img.src = source;
  });
  if (file.size <= 1000000 && source.length <= 1400000) return source;
  let edge = 1920;
  for (
    let attempt = 0;
    attempt < 5;
    attempt++, edge = Math.round(edge * 0.75)
  ) {
    const ratio = Math.min(
      1,
      edge / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Não foi possível preparar a imagem neste navegador.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", 0.82);
    if (result.startsWith("data:image/") && result.length <= 1300000)
      return result;
  }
  throw new Error("Não foi possível reduzir a foto. Escolha uma imagem menor.");
}
