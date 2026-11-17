export const useRouter = () => ({
  push: (url: string) => {
    window.location.href = url;
  },
});
