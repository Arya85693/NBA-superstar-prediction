/** Runs before paint to avoid a light-mode flash when dark is saved. */
export function ThemeScript() {
  const script = `(function(){try{var k="hs-theme";var t=localStorage.getItem(k);if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}else if(t==="light"){document.documentElement.style.colorScheme="light";}}catch(e){}})();`;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
