using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Xml.Linq;

namespace TettaProAnalogs
{
    /// <summary>Одна пара «артикул конкурента → аналог TETTAPRO».</summary>
    public sealed class AnalogPair
    {
        public string Brand { get; set; }        // бренд конкурента, например «Mean Well»
        public string Competitor { get; set; }   // артикул конкурента, например «MDR-20-24»
        public string TettaPro { get; set; }     // аналог TETTAPRO, например «MTPR-M02024», или «Нет»
        public string Result { get; set; }       // колонка «Результат подбора»
        public string Conditions { get; set; }   // колонка «Отличия и условия замены»

        /// <summary>В таблице прямо указано, что аналога нет («Нет»).</summary>
        public bool NoAnalog { get { return AnalogTable.IsNoAnalog(TettaPro); } }

        /// <summary>
        /// Нормализованные варианты артикула конкурента: целиком и по частям.
        /// «MDR-20-24 / SQ0752-0008» находится и по «MDR-20-24», и по «SQ0752-0008»;
        /// «IP-502 52052DEK (ИП502-1Н24)» — по «52052DEK» и «ИП502-1Н24».
        /// </summary>
        public List<string> Keys
        {
            get
            {
                if (keys != null) return keys;
                keys = new List<string> { AnalogTable.Normalize(Competitor) };
                foreach (var part in Competitor.Split(new[] { '/', '(', ')', ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    var t = part.Trim();
                    keys.Add(AnalogTable.Normalize(t));
                    // последнее «слово» с цифрами: «IP-502 52052DEK» → «52052DEK», «OptiPower MDR-60-24-1» → «MDR-60-24-1»
                    var words = t.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (words.Length > 1 && words[words.Length - 1].Any(char.IsDigit))
                        keys.Add(AnalogTable.Normalize(words[words.Length - 1]));
                }
                keys = keys.Where(k => k.Length >= 3).Distinct().ToList();
                return keys;
            }
        }
        private List<string> keys;
    }

    /// <summary>
    /// Таблица замены. Читается из .xlsx: в строке-заголовке ищется колонка «TettaPRO»,
    /// все остальные непустые колонки заголовка считаются брендами конкурентов.
    /// </summary>
    public sealed class AnalogTable
    {
        public const string TettaHeader = "TETTAPRO";
        public const string ResultHeader = "РЕЗУЛЬТАТПОДБОРА";

        public static bool IsNoAnalog(string tetta)
        {
            var n = Normalize(tetta);
            return n == "НЕТ" || n == "NO" || n == "NONE" || n.Length == 0;
        }

        public List<AnalogPair> Pairs { get; private set; }
        public List<string> Brands { get; private set; }
        public string Source { get; private set; }

        private AnalogTable() { Pairs = new List<AnalogPair>(); Brands = new List<string>(); }

        /// <summary>Убирает пробелы, дефисы, точки и т.п. и приводит к верхнему регистру.</summary>
        public static string Normalize(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            var sb = new StringBuilder(s.Length);
            foreach (var ch in s)
                if (char.IsLetterOrDigit(ch)) sb.Append(char.ToUpperInvariant(ch));
            return sb.ToString();
        }

        public static string PrettyBrand(string header)
        {
            var n = Normalize(header);
            if (n == "MEANWELL") return "Mean Well";
            return header.Trim();
        }

        public static AnalogTable Load(Stream xlsx, string source)
        {
            var rows = XlsxReader.ReadFirstSheet(xlsx);
            return TryLoadList(rows, source) ?? LoadWide(rows, source);
        }

        /// <summary>
        /// Основной формат — список: «Бренд | Модель / артикул | Кандидат TETTAPRO | Результат подбора | Отличия и условия замены».
        /// Порядок столбцов любой, строка заголовков ищется автоматически.
        /// </summary>
        private static AnalogTable TryLoadList(List<List<string>> rows, string source)
        {
            for (int r = 0; r < rows.Count; r++)
            {
                int brand = -1, model = -1, tetta = -1, result = -1, cond = -1;
                for (int c = 0; c < rows[r].Count; c++)
                {
                    var n = Normalize(rows[r][c]);
                    if (n == "БРЕНД") brand = c;
                    else if (n.StartsWith("МОДЕЛЬ") || n == "АРТИКУЛ") model = c;
                    else if (n.Contains(TettaHeader)) tetta = c;
                    else if (n == ResultHeader) result = c;
                    else if (n.StartsWith("ОТЛИЧИЯ")) cond = c;
                }
                if (brand < 0 || model < 0 || tetta < 0) continue;

                var table = new AnalogTable { Source = source };
                var seen = new HashSet<string>();
                for (int i = r + 1; i < rows.Count; i++)
                {
                    var row = rows[i];
                    string b = Cell(row, brand), m = Cell(row, model), t = Cell(row, tetta);
                    if (b.Length == 0 || m.Length == 0) continue;
                    b = PrettyBrand(b);
                    if (!seen.Add(b + "|" + Normalize(m) + "|" + Normalize(t))) continue;
                    table.Pairs.Add(new AnalogPair
                    {
                        Brand = b, Competitor = m, TettaPro = t.Length == 0 ? "Нет" : t,
                        Result = result >= 0 ? Cell(row, result) : "",
                        Conditions = cond >= 0 ? Cell(row, cond) : "",
                    });
                }
                table.Brands = table.Pairs.Select(p => p.Brand).Distinct().ToList();
                if (table.Pairs.Count == 0) throw new InvalidDataException("В таблице нет ни одной строки с моделью.");
                return table;
            }
            return null;
        }

        /// <summary>Старый формат: столбец TettaPRO и по столбцу на каждый бренд.</summary>
        private static AnalogTable LoadWide(List<List<string>> rows, string source)
        {
            var table = new AnalogTable { Source = source };

            int headerRow = -1, tettaCol = -1;
            for (int r = 0; r < rows.Count && headerRow < 0; r++)
                for (int c = 0; c < rows[r].Count; c++)
                    if (Normalize(rows[r][c]) == TettaHeader) { headerRow = r; tettaCol = c; break; }

            if (headerRow < 0)
                throw new InvalidDataException("В таблице не найдены столбцы «Бренд», «Модель / артикул», «Кандидат TETTAPRO».");

            var brandCols = new Dictionary<int, string>();
            int resultCol = -1;
            var header = rows[headerRow];
            for (int c = 0; c < header.Count; c++)
            {
                if (c == tettaCol || string.IsNullOrWhiteSpace(header[c])) continue;
                if (Normalize(header[c]) == ResultHeader) { resultCol = c; continue; }
                brandCols[c] = PrettyBrand(header[c]);
            }

            if (brandCols.Count == 0)
                throw new InvalidDataException("В таблице нет ни одной колонки с брендом конкурента.");

            var seen = new HashSet<string>();
            for (int r = headerRow + 1; r < rows.Count; r++)
            {
                var row = rows[r];
                string tetta = Cell(row, tettaCol);
                if (tetta.Length == 0) continue;
                string info = resultCol >= 0 ? Cell(row, resultCol) : "";
                foreach (var kv in brandCols)
                {
                    string comp = Cell(row, kv.Key);
                    if (comp.Length == 0) continue;
                    string key = kv.Value + "|" + Normalize(comp) + "|" + Normalize(tetta);
                    if (!seen.Add(key)) continue;
                    table.Pairs.Add(new AnalogPair { Brand = kv.Value, Competitor = comp, TettaPro = tetta, Result = info });
                }
            }

            table.Brands = brandCols.Values.Distinct().ToList();
            return table;
        }

        private static string Cell(List<string> row, int c)
        {
            return c < row.Count && row[c] != null ? row[c].Trim() : "";
        }

        /// <summary>
        /// Поиск. Сначала точное совпадение артикула (без учёта регистра, пробелов и дефисов),
        /// если его нет — все артикулы, содержащие введённый текст.
        /// Ищется и по артикулам конкурента, и по артикулам TETTAPRO (обратный поиск).
        /// </summary>
        public SearchResult Search(string query, string brand)
        {
            var q = Normalize(query);
            var result = new SearchResult { Query = query };
            if (q.Length == 0) return result;

            IEnumerable<AnalogPair> pool = Pairs;
            if (!string.IsNullOrEmpty(brand))
                pool = pool.Where(p => p.Brand == brand);
            var list = pool.ToList();

            var exact = list.Where(p => p.Keys.Contains(q)).ToList();
            if (exact.Count > 0) { result.Matches = exact; result.Exact = true; return result; }

            var exactReverse = list.Where(p => Normalize(p.TettaPro) == q).ToList();
            if (exactReverse.Count > 0) { result.Matches = exactReverse; result.Exact = true; result.Reverse = true; return result; }

            result.Matches = list
                .Where(p => Normalize(p.Competitor).Contains(q) || Normalize(p.TettaPro).Contains(q))
                .OrderBy(p => Normalize(p.Competitor).StartsWith(q) ? 0 : 1)
                .ThenBy(p => p.Competitor, StringComparer.OrdinalIgnoreCase)
                .ToList();
            return result;
        }
    }

    public sealed class SearchResult
    {
        public string Query { get; set; }
        public bool Exact { get; set; }
        public bool Reverse { get; set; }
        public List<AnalogPair> Matches { get; set; }
        public SearchResult() { Matches = new List<AnalogPair>(); }
    }

    /// <summary>Минимальный читатель .xlsx без сторонних библиотек: значения ячеек первого листа.</summary>
    internal static class XlsxReader
    {
        private static readonly XNamespace Main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        private static readonly XNamespace RelNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private static readonly XNamespace PkgRel = "http://schemas.openxmlformats.org/package/2006/relationships";

        public static List<List<string>> ReadFirstSheet(Stream stream)
        {
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Read, true))
            {
                var shared = new List<string>();
                var ssEntry = Find(zip, "xl/sharedStrings.xml");
                if (ssEntry != null)
                {
                    var ss = LoadXml(ssEntry);
                    foreach (var si in ss.Root.Elements(Main + "si"))
                        shared.Add(string.Concat(si.Descendants(Main + "t").Select(t => t.Value)));
                }

                var sheetPath = FirstSheetPath(zip);
                var sheetEntry = Find(zip, sheetPath);
                if (sheetEntry == null) throw new InvalidDataException("Не найден лист в файле .xlsx");
                var sheet = LoadXml(sheetEntry);

                var rows = new List<List<string>>();
                foreach (var row in sheet.Descendants(Main + "row"))
                {
                    int rIndex;
                    var rAttr = (string)row.Attribute("r");
                    rIndex = rAttr != null ? int.Parse(rAttr) - 1 : rows.Count;
                    while (rows.Count <= rIndex) rows.Add(new List<string>());
                    var cells = rows[rIndex];

                    int next = 0;
                    foreach (var c in row.Elements(Main + "c"))
                    {
                        var refAttr = (string)c.Attribute("r");
                        int col = refAttr != null ? ColumnIndex(refAttr) : next;
                        next = col + 1;
                        string type = (string)c.Attribute("t");
                        string value;
                        if (type == "inlineStr")
                            value = string.Concat(c.Descendants(Main + "t").Select(t => t.Value));
                        else
                        {
                            var v = c.Element(Main + "v");
                            value = v == null ? "" : v.Value;
                            if (type == "s" && value.Length > 0)
                            {
                                int idx;
                                value = int.TryParse(value, out idx) && idx < shared.Count ? shared[idx] : "";
                            }
                        }
                        while (cells.Count <= col) cells.Add("");
                        cells[col] = value;
                    }
                }
                return rows;
            }
        }

        private static string FirstSheetPath(ZipArchive zip)
        {
            try
            {
                var wb = LoadXml(Find(zip, "xl/workbook.xml"));
                var first = wb.Descendants(Main + "sheet").First();
                var rid = (string)first.Attribute(RelNs + "id");
                var rels = LoadXml(Find(zip, "xl/_rels/workbook.xml.rels"));
                var target = rels.Root.Elements(PkgRel + "Relationship")
                    .First(r => (string)r.Attribute("Id") == rid).Attribute("Target").Value;
                if (target.StartsWith("/")) return target.TrimStart('/');
                return "xl/" + target;
            }
            catch
            {
                var e = zip.Entries.FirstOrDefault(x => x.FullName.StartsWith("xl/worksheets/") && x.FullName.EndsWith(".xml"));
                return e != null ? e.FullName : "xl/worksheets/sheet1.xml";
            }
        }

        private static ZipArchiveEntry Find(ZipArchive zip, string path)
        {
            return zip.Entries.FirstOrDefault(e => string.Equals(e.FullName.Replace('\\', '/'), path, StringComparison.OrdinalIgnoreCase));
        }

        private static XDocument LoadXml(ZipArchiveEntry entry)
        {
            using (var s = entry.Open()) return XDocument.Load(s);
        }

        private static int ColumnIndex(string cellRef)
        {
            int col = 0;
            foreach (var ch in cellRef)
            {
                if (ch >= 'A' && ch <= 'Z') col = col * 26 + (ch - 'A' + 1);
                else if (ch >= 'a' && ch <= 'z') col = col * 26 + (ch - 'a' + 1);
                else break;
            }
            return col - 1;
        }
    }
}
