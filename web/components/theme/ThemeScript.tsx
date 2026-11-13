/** Runs before paint so the default dark console never flashes light (unless light is saved). */
export function ThemeScript() {
  const script = `(function(){try{var k="hs-theme";var t=localStorage.getItem(k);if(t==="light"){document.documentElement.style.colorScheme="light";}else{document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}}catch(e){}})();`;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
