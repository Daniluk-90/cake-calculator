using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;

namespace TettaProAnalogs
{
    public sealed class MainForm : Form
    {
        // Фирменные цвета — меняются в одном месте.
        static readonly Color HeaderBack = Color.FromArgb(24, 28, 34);
        static readonly Color Accent = Color.FromArgb(232, 78, 27);
        static readonly Color AccentHover = Color.FromArgb(205, 62, 15);
        static readonly Color PageBack = Color.FromArgb(244, 245, 247);
        static readonly Color CardBorder = Color.FromArgb(222, 225, 230);
        static readonly Color TextMain = Color.FromArgb(28, 31, 36);
        static readonly Color TextMuted = Color.FromArgb(110, 116, 125);
        static readonly Color SuccessBack = Color.FromArgb(236, 248, 240);
        static readonly Color SuccessBorder = Color.FromArgb(46, 160, 90);
        static readonly Color WarnBack = Color.FromArgb(253, 243, 236);

        const string AllBrands = "Все бренды";
        const string SiteUrl = "https://tetta.pro";

        AnalogTable table;
        Image customLogo;

        Panel header;
        ComboBox brandBox;
        TextBox articleBox;
        Button searchButton;
        Panel resultCard;
        Label resultCaption, resultValue, resultNote;
        Button copyButton;
        DataGridView grid;
        Label statusLabel, gridCaption;

        public MainForm()
        {
            Text = "TETTAPRO — подбор аналогов блоков питания";
            Font = new Font("Segoe UI", 10f);
            BackColor = PageBack;
            ForeColor = TextMain;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(760, 560);
            Size = new Size(900, 660);
            AutoScaleMode = AutoScaleMode.Dpi;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            LoadCustomLogo();
            BuildUi();
            LoadTable(null);
        }

        static string AppDir { get { return Path.GetDirectoryName(Application.ExecutablePath); } }

        void LoadCustomLogo()
        {
            var path = Path.Combine(AppDir, "logo.png");
            if (!File.Exists(path)) return;
            try
            {
                using (var fs = File.OpenRead(path))
                using (var img = Image.FromStream(fs))
                    customLogo = new Bitmap(img);
            }
            catch { customLogo = null; }
        }

        // ---------- Интерфейс ----------

        void BuildUi()
        {
            header = new Panel { Dock = DockStyle.Top, Height = 76, BackColor = HeaderBack };
            header.Paint += PaintHeader;
            header.Resize += (s, e) => header.Invalidate();

            var status = new Panel { Dock = DockStyle.Bottom, Height = 32, BackColor = Color.White };
            status.Paint += (s, e) => e.Graphics.DrawLine(new Pen(CardBorder), 0, 0, status.Width, 0);
            statusLabel = new Label { AutoSize = false, Dock = DockStyle.Fill, ForeColor = TextMuted, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(16, 0, 0, 0), Font = new Font(Font.FontFamily, 9f) };
            var loadLink = MakeLink("Загрузить таблицу…", 150, ChooseTable);
            var siteLink = MakeLink("tetta.pro", 90, OpenSite);
            status.Controls.Add(statusLabel);
            status.Controls.Add(loadLink);
            status.Controls.Add(siteLink);

            var body = new Panel { Dock = DockStyle.Fill, Padding = new Padding(24, 20, 24, 16), BackColor = PageBack };

            // --- Карточка поиска ---
            var searchCard = new Panel { Dock = DockStyle.Top, Height = 132, BackColor = Color.White, Padding = new Padding(20, 14, 20, 14) };
            searchCard.Paint += PaintCardBorder;

            var title = new Label { Text = "Подбор аналога", Font = new Font(Font.FontFamily, 14f, FontStyle.Bold), AutoSize = true, Location = new Point(20, 12), ForeColor = TextMain };
            var subtitle = new Label { Text = "Введите артикул блока питания другого производителя — программа покажет аналог TETTAPRO", AutoSize = true, Location = new Point(21, 40), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 9f) };

            var brandLabel = new Label { Text = "Бренд", AutoSize = true, Location = new Point(20, 68), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 8.5f) };
            brandBox = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Location = new Point(20, 86), Width = 180, Font = new Font(Font.FontFamily, 11f), FlatStyle = FlatStyle.Flat };

            var articleLabel = new Label { Text = "Артикул", AutoSize = true, Location = new Point(216, 68), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 8.5f) };
            articleBox = new TextBox { Location = new Point(216, 86), Width = 380, Font = new Font(Font.FontFamily, 11f), BorderStyle = BorderStyle.FixedSingle, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            SetCue(articleBox, "Например: MDR-20-24");
            articleBox.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; DoSearch(); } };

            searchButton = new Button { Text = "Поиск", Location = new Point(612, 84), Size = new Size(140, 32), FlatStyle = FlatStyle.Flat, BackColor = Accent, ForeColor = Color.White, Font = new Font(Font.FontFamily, 10.5f, FontStyle.Bold), Cursor = Cursors.Hand, Anchor = AnchorStyles.Top | AnchorStyles.Right };
            searchButton.FlatAppearance.BorderSize = 0;
            searchButton.FlatAppearance.MouseOverBackColor = AccentHover;
            searchButton.Click += (s, e) => DoSearch();

            searchCard.Controls.AddRange(new Control[] { title, subtitle, brandLabel, brandBox, articleLabel, articleBox, searchButton });
            searchCard.Resize += (s, e) =>
            {
                searchButton.Left = searchCard.ClientSize.Width - 20 - searchButton.Width;
                articleBox.Width = searchButton.Left - 16 - articleBox.Left;
            };

            var gap1 = new Panel { Dock = DockStyle.Top, Height = 14, BackColor = PageBack };

            // --- Карточка результата ---
            resultCard = new Panel { Dock = DockStyle.Top, Height = 104, BackColor = Color.White, Padding = new Padding(20, 12, 20, 12) };
            resultCard.Paint += PaintResultCard;
            resultCaption = new Label { Text = "АНАЛОГ TETTAPRO", AutoSize = true, Location = new Point(24, 14), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 8.5f, FontStyle.Bold) };
            resultValue = new Label { Text = "—", AutoSize = true, Location = new Point(20, 34), ForeColor = TextMain, Font = new Font(Font.FontFamily, 22f, FontStyle.Bold) };
            resultNote = new Label { Text = "Введите артикул и нажмите «Поиск»", AutoSize = true, Location = new Point(24, 76), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 9f) };
            copyButton = new Button { Text = "Копировать", Size = new Size(140, 32), FlatStyle = FlatStyle.Flat, BackColor = Color.White, ForeColor = TextMain, Cursor = Cursors.Hand, Anchor = AnchorStyles.Top | AnchorStyles.Right, Visible = false };
            copyButton.FlatAppearance.BorderColor = CardBorder;
            copyButton.Click += (s, e) => CopyResult();
            resultCard.Controls.AddRange(new Control[] { resultCaption, resultValue, resultNote, copyButton });
            resultCard.Resize += (s, e) => { copyButton.Location = new Point(resultCard.ClientSize.Width - 20 - copyButton.Width, 36); };

            var gap2 = new Panel { Dock = DockStyle.Top, Height = 14, BackColor = PageBack };

            // --- Таблица ---
            gridCaption = new Label { Text = "Таблица соответствия", Dock = DockStyle.Top, Height = 26, ForeColor = TextMuted, Font = new Font(Font.FontFamily, 9f, FontStyle.Bold) };

            grid = new DataGridView
            {
                Dock = DockStyle.Fill,
                ReadOnly = true,
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                AllowUserToResizeRows = false,
                RowHeadersVisible = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                MultiSelect = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                BackgroundColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle,
                CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal,
                GridColor = Color.FromArgb(235, 237, 240),
                EnableHeadersVisualStyles = false,
                ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing,
                ColumnHeadersHeight = 34,
                ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.None,
            };
            grid.RowTemplate.Height = 30;
            grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(248, 249, 250);
            grid.ColumnHeadersDefaultCellStyle.ForeColor = TextMuted;
            grid.ColumnHeadersDefaultCellStyle.Font = new Font(Font.FontFamily, 9f, FontStyle.Bold);
            grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = Color.FromArgb(248, 249, 250);
            grid.ColumnHeadersDefaultCellStyle.Padding = new Padding(8, 0, 0, 0);
            grid.DefaultCellStyle.Padding = new Padding(8, 0, 0, 0);
            grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(253, 235, 226);
            grid.DefaultCellStyle.SelectionForeColor = TextMain;
            grid.Columns.Add("brand", "Бренд");
            grid.Columns.Add("competitor", "Артикул конкурента");
            grid.Columns.Add("tetta", "Аналог TETTAPRO");
            grid.Columns["brand"].FillWeight = 25;
            grid.Columns["competitor"].FillWeight = 38;
            grid.Columns["tetta"].FillWeight = 37;
            grid.Columns["tetta"].DefaultCellStyle.Font = new Font(Font.FontFamily, 10f, FontStyle.Bold);
            grid.Columns["tetta"].DefaultCellStyle.ForeColor = Accent;
            grid.CellDoubleClick += (s, e) =>
            {
                if (e.RowIndex < 0) return;
                var v = grid.Rows[e.RowIndex].Cells["tetta"].Value as string;
                if (!string.IsNullOrEmpty(v)) { SafeCopy(v); statusLabel.Text = "Скопировано: " + v; }
            };
            var menu = new ContextMenuStrip();
            menu.Items.Add("Копировать аналог TETTAPRO", null, (s, e) => CopyGridCell("tetta"));
            menu.Items.Add("Копировать артикул конкурента", null, (s, e) => CopyGridCell("competitor"));
            grid.ContextMenuStrip = menu;

            // Порядок добавления: элементы с Dock=Top добавляются в обратном порядке.
            body.Controls.Add(grid);
            body.Controls.Add(gridCaption);
            body.Controls.Add(gap2);
            body.Controls.Add(resultCard);
            body.Controls.Add(gap1);
            body.Controls.Add(searchCard);

            Controls.Add(body);
            Controls.Add(status);
            Controls.Add(header);

            brandBox.SelectedIndexChanged += (s, e) => { if (articleBox.Text.Trim().Length > 0) DoSearch(); else ShowAll(); };
            Shown += (s, e) => articleBox.Focus();
        }

        Label MakeLink(string text, int width, Action onClick)
        {
            var l = new Label { Text = text, AutoSize = false, Width = width, Dock = DockStyle.Right, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Accent, Cursor = Cursors.Hand, Font = new Font(Font.FontFamily, 9f, FontStyle.Underline) };
            l.Click += (s, e) => onClick();
            l.MouseEnter += (s, e) => l.ForeColor = AccentHover;
            l.MouseLeave += (s, e) => l.ForeColor = Accent;
            return l;
        }

        void PaintHeader(object sender, PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            int x = 24;

            if (customLogo != null)
            {
                int h = header.Height - 28;
                int w = (int)(customLogo.Width * (h / (double)customLogo.Height));
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(customLogo, new Rectangle(x, 14, w, h));
                x += w;
            }
            else
            {
                // Фирменная надпись TETTA·PRO
                using (var f = new Font(Font.FontFamily, 22f, FontStyle.Bold))
                using (var white = new SolidBrush(Color.White))
                using (var accent = new SolidBrush(Accent))
                {
                    var fmt = StringFormat.GenericTypographic;
                    var s1 = g.MeasureString("TETTA", f, PointF.Empty, fmt);
                    float y = (header.Height - s1.Height) / 2f;
                    g.DrawString("TETTA", f, white, x, y, fmt);
                    var boxX = x + s1.Width + 6;
                    var s2 = g.MeasureString("PRO", f, PointF.Empty, fmt);
                    var rect = new RectangleF(boxX, y - 2, s2.Width + 14, s1.Height + 4);
                    using (var path = RoundRect(rect, 5)) g.FillPath(accent, path);
                    g.DrawString("PRO", f, white, boxX + 7, y, fmt);
                    x = (int)(rect.Right);
                }
            }

            using (var f = new Font(Font.FontFamily, 10.5f))
            using (var b = new SolidBrush(Color.FromArgb(190, 196, 205)))
            {
                var text = "Подбор аналогов блоков питания";
                var sz = g.MeasureString(text, f);
                float tx = header.Width - sz.Width - 24;
                if (tx > x + 24)
                    g.DrawString(text, f, b, tx, (header.Height - sz.Height) / 2f);
            }
        }

        static GraphicsPath RoundRect(RectangleF r, float rad)
        {
            var p = new GraphicsPath();
            float d = rad * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        static void PaintCardBorder(object sender, PaintEventArgs e)
        {
            var c = (Control)sender;
            using (var pen = new Pen(CardBorder)) e.Graphics.DrawRectangle(pen, 0, 0, c.Width - 1, c.Height - 1);
        }

        int resultState; // 0 — пусто, 1 — найдено, 2 — не найдено

        void PaintResultCard(object sender, PaintEventArgs e)
        {
            var c = (Control)sender;
            Color border = resultState == 1 ? SuccessBorder : resultState == 2 ? Accent : CardBorder;
            using (var pen = new Pen(CardBorder)) e.Graphics.DrawRectangle(pen, 0, 0, c.Width - 1, c.Height - 1);
            using (var b = new SolidBrush(border)) e.Graphics.FillRectangle(b, 0, 0, 5, c.Height);
        }

        void SetResult(int state, string caption, string value, string note, bool canCopy)
        {
            resultState = state;
            resultCard.BackColor = state == 1 ? SuccessBack : state == 2 ? WarnBack : Color.White;
            resultCaption.Text = caption;
            resultValue.Text = value;
            resultValue.ForeColor = state == 2 ? TextMuted : TextMain;
            resultValue.Font = new Font(Font.FontFamily, state == 2 ? 15f : 22f, FontStyle.Bold);
            resultValue.Top = state == 2 ? 38 : 32;
            resultNote.Text = note;
            copyButton.Visible = canCopy;
            resultCard.Invalidate();
        }

        // ---------- Данные ----------

        void LoadTable(string path)
        {
            try
            {
                if (path == null)
                {
                    var local = Path.Combine(AppDir, "analogs.xlsx");
                    if (File.Exists(local)) path = local;
                }

                if (path != null)
                {
                    using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        table = AnalogTable.Load(fs, Path.GetFileName(path));
                }
                else
                {
                    using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("analogs.xlsx"))
                        table = AnalogTable.Load(s, "встроенная таблица");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Не удалось прочитать таблицу:\n" + ex.Message, "Ошибка", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                if (table == null)
                    using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("analogs.xlsx"))
                        table = AnalogTable.Load(s, "встроенная таблица");
            }

            var selected = brandBox.SelectedItem as string;
            brandBox.Items.Clear();
            if (table.Brands.Count > 1) brandBox.Items.Add(AllBrands);
            foreach (var b in table.Brands) brandBox.Items.Add(b);
            int idx = selected != null ? brandBox.Items.IndexOf(selected) : -1;
            brandBox.SelectedIndex = idx >= 0 ? idx : 0;

            var auto = new AutoCompleteStringCollection();
            auto.AddRange(table.Pairs.Select(p => p.Competitor).Concat(table.Pairs.Select(p => p.TettaPro)).Distinct().ToArray());
            articleBox.AutoCompleteCustomSource = auto;
            articleBox.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            articleBox.AutoCompleteSource = AutoCompleteSource.CustomSource;

            ShowAll();
            UpdateStatus();
        }

        void UpdateStatus()
        {
            statusLabel.Text = string.Format("База: {0} позиций ({1}) · источник: {2}",
                table.Pairs.Count, string.Join(", ", table.Brands), table.Source);
        }

        void ChooseTable()
        {
            using (var dlg = new OpenFileDialog { Filter = "Таблица Excel (*.xlsx)|*.xlsx", Title = "Выберите таблицу замены" })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                LoadTable(dlg.FileName);
                // Запоминаем таблицу рядом с программой, чтобы она открывалась по умолчанию.
                try
                {
                    var target = Path.Combine(AppDir, "analogs.xlsx");
                    if (!string.Equals(Path.GetFullPath(dlg.FileName), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase))
                        File.Copy(dlg.FileName, target, true);
                }
                catch { /* нет прав на запись в папку программы — таблица действует до закрытия */ }
            }
        }

        string SelectedBrand
        {
            get
            {
                var b = brandBox.SelectedItem as string;
                return b == null || b == AllBrands ? null : b;
            }
        }

        void ShowAll()
        {
            FillGrid(table.Pairs.Where(p => SelectedBrand == null || p.Brand == SelectedBrand));
            SetResult(0, "АНАЛОГ TETTAPRO", "—", "Введите артикул и нажмите «Поиск»", false);
        }

        void SetTableVisible(bool visible)
        {
            grid.Visible = visible;
            gridCaption.Visible = visible;
        }

        void FillGrid(IEnumerable<AnalogPair> pairs)
        {
            SetTableVisible(true);
            grid.Rows.Clear();
            foreach (var p in pairs) grid.Rows.Add(p.Brand, p.Competitor, p.TettaPro);
            grid.ClearSelection();
        }

        void DoSearch()
        {
            var q = articleBox.Text.Trim();
            if (q.Length == 0) { ShowAll(); return; }

            var r = table.Search(q, SelectedBrand);
            if (r.Matches.Count == 0)
            {
                grid.Rows.Clear();
                SetTableVisible(false);
                SetResult(2, "НЕ НАЙДЕНО", "Аналог для «" + q + "» не найден",
                    "Проверьте артикул или напишите нам на почту sales@mechatronics.ru для уточнения замены.", false);
                return;
            }

            FillGrid(r.Matches);

            if (r.Exact && !r.Reverse)
            {
                var analogs = r.Matches.Select(m => m.TettaPro).Distinct().ToList();
                var src = r.Matches[0];
                SetResult(1, "АНАЛОГ TETTAPRO ДЛЯ " + src.Brand.ToUpperInvariant() + " " + src.Competitor,
                    string.Join("  /  ", analogs),
                    analogs.Count > 1 ? "Подходит любой из вариантов" : "Нажмите «Копировать», чтобы вставить артикул в заказ",
                    true);
            }
            else if (r.Exact && r.Reverse)
            {
                var comps = r.Matches.Select(m => m.Competitor).Distinct().ToList();
                SetResult(1, "АРТИКУЛ TETTAPRO " + r.Matches[0].TettaPro + " ЗАМЕНЯЕТ",
                    string.Join("  /  ", comps),
                    "Это артикул TETTAPRO — показаны модели, которые он заменяет", false);
            }
            else
            {
                SetResult(r.Matches.Count == 1 ? 1 : 0,
                    "ПОХОЖИЕ АРТИКУЛЫ",
                    r.Matches.Count == 1 ? r.Matches[0].TettaPro : "Найдено вариантов: " + r.Matches.Count,
                    r.Matches.Count == 1 ? "Ближайшее совпадение: " + r.Matches[0].Brand + " " + r.Matches[0].Competitor
                                         : "Точного совпадения нет — выберите нужную строку в таблице ниже",
                    r.Matches.Count == 1);
            }
        }

        void CopyResult()
        {
            var r = table.Search(articleBox.Text.Trim(), SelectedBrand);
            var text = r.Matches.Count > 0 ? string.Join(", ", r.Matches.Select(m => m.TettaPro).Distinct()) : resultValue.Text;
            SafeCopy(text);
            copyButton.Text = "Скопировано ✓";
            var t = new Timer { Interval = 1500 };
            t.Tick += (s, e) => { copyButton.Text = "Копировать"; t.Dispose(); };
            t.Start();
        }

        void CopyGridCell(string column)
        {
            if (grid.CurrentRow == null) return;
            var v = grid.CurrentRow.Cells[column].Value as string;
            if (!string.IsNullOrEmpty(v)) { SafeCopy(v); statusLabel.Text = "Скопировано: " + v; }
        }

        static void SafeCopy(string text)
        {
            try { Clipboard.SetText(text); } catch { }
        }

        void OpenSite()
        {
            try { System.Diagnostics.Process.Start(SiteUrl); } catch { }
        }

        // Подсказка-плейсхолдер в TextBox (EM_SETCUEBANNER).
        static void SetCue(TextBox box, string text)
        {
            box.HandleCreated += (s, e) =>
            {
                try { NativeMethods.SendMessage(box.Handle, 0x1501, (IntPtr)1, text); } catch { }
            };
        }
    }

    internal static class NativeMethods
    {
        [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);
    }
}
