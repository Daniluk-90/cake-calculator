using System;
using System.Drawing;
using System.Drawing.Text;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

namespace TettaProAnalogs
{
    /// <summary>
    /// Фирменный шрифт сайта ps.tetta.pro — Manrope (лицензия SIL OFL), встроен в программу.
    /// Если подключить не удалось, используется Segoe UI.
    /// </summary>
    internal static class BrandFonts
    {
        private static readonly PrivateFontCollection Collection = new PrivateFontCollection();
        private static FontFamily family;

        public static FontFamily Family
        {
            get
            {
                if (family == null) family = Load() ?? new FontFamily("Segoe UI");
                return family;
            }
        }

        private static FontFamily Load()
        {
            try
            {
                var dir = Path.Combine(Path.GetTempPath(), "TettaPRO-Analogs-fonts");
                Directory.CreateDirectory(dir);
                foreach (var name in new[] { "Manrope-Regular.ttf", "Manrope-Bold.ttf" })
                {
                    var path = Path.Combine(dir, name);
                    using (var src = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                    {
                        if (src == null) return null;
                        if (!File.Exists(path) || new FileInfo(path).Length != src.Length)
                            using (var dst = File.Create(path)) src.CopyTo(dst);
                    }
                    // GDI (обычные надписи WinForms) и GDI+ (рисование) видят шрифт по отдельности.
                    try { AddFontResourceEx(path, FR_PRIVATE, IntPtr.Zero); } catch { }
                    Collection.AddFontFile(path);
                }
                foreach (var f in Collection.Families)
                    if (f.Name.StartsWith("Manrope", StringComparison.OrdinalIgnoreCase) && Works(f)) return f;
            }
            catch { }
            return null;
        }

        /// <summary>Проверка, что шрифт действительно доступен для отрисовки.</summary>
        private static bool Works(FontFamily f)
        {
            try
            {
                using (var font = new Font(f, 10f, FontStyle.Bold))
                    return font.Height > 0 && font.Name.StartsWith("Manrope", StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        private const uint FR_PRIVATE = 0x10;

        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
        private static extern int AddFontResourceEx(string lpszFilename, uint fl, IntPtr pdv);
    }
}
