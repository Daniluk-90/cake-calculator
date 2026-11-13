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
        // Палитра сайта ps.tetta.pro.
        static readonly Color HeaderBack = ColorTranslator.FromHtml("#0b1523");   // --navy
        static readonly Color HeaderLine = ColorTranslator.FromHtml("#1c2b3d");
        static readonly Color HeaderText = ColorTranslator.FromHtml("#9cabbc");   // --muted
        static readonly Color Accent = ColorTranslator.FromHtml("#1589ee");       // --electric
        static readonly Color AccentHover = ColorTranslator.FromHtml("#0f74cc");
        static readonly Color AccentLight = ColorTranslator.FromHtml("#54b9ff");  // --blue
        static readonly Color PageBack = ColorTranslator.FromHtml("#f3f6f8");     // --paper
        static readonly Color CardBorder = ColorTranslator.FromHtml("#d8e0e6");   // --line
        static readonly Color TextMain = ColorTranslator.FromHtml("#14283e");     // --ink
        static readonly Color TextMuted = ColorTranslator.FromHtml("#62758a");
        static readonly Color SuccessBack = ColorTranslator.FromHtml("#eef6fe");
        static readonly Color SuccessBorder = Accent;
        static readonly Color WarnBack = ColorTranslator.FromHtml("#f7f9fb");
        static readonly Color WarnBorder = ColorTranslator.FromHtml("#9cabbc");

        const string AllBrands = "Все бренды";
        const string SiteUrl = "https://tetta.pro";
        const string Email = "sales@mechatronics.ru";

        AnalogTable table;
        Image customLogo;

        Panel header;
        ComboBox brandBox;
        TextBox articleBox;
        Button searchButton;
        Panel resultCard;
        Label resultCaption, resultValue, resultNote, resultDetails;
        Button copyButton;
        DataGridView grid;
        Label statusLabel, gridCaption, brandHint;
        Panel gapResult;
        bool settingBrand;

        public MainForm()
        {
            Text = "TETTAPRO — подбор аналогов блоков питания";
            Font = new Font(BrandFonts.Family, 10f);
            BackColor = PageBack;
            ForeColor = TextMain;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(800, 600);
            Size = new Size(960, 700);
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
            try
            {
                // logo.png рядом с программой заменяет встроенный логотип.
                using (var fs = File.Exists(path) ? (Stream)File.OpenRead(path)
                                                  : Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"))
                using (var img = Image.FromStream(fs))
                    customLogo = new Bitmap(img);
            }
            catch { customLogo = null; }
        }

        // ---------- Интерфейс ----------

        void BuildUi()
        {
            header = new Panel { Dock = DockStyle.Top, Height = 72, BackColor = HeaderBack };
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

            var contact = new Button { Text = "Написать нам", Size = new Size(150, 36), FlatStyle = FlatStyle.Flat, BackColor = HeaderBack, ForeColor = Color.White, Font = new Font(Font.FontFamily, 9.5f, FontStyle.Bold), Cursor = Cursors.Hand, Anchor = AnchorStyles.Top | AnchorStyles.Right };
            contact.FlatAppearance.BorderColor = Accent;
            contact.FlatAppearance.BorderSize = 1;
            contact.FlatAppearance.MouseOverBackColor = ColorTranslator.FromHtml("#10233a");
            contact.Click += (s, e) => { try { System.Diagnostics.Process.Start("mailto:" + Email + "?subject=" + Uri.EscapeDataString("Подбор аналога блока питания")); } catch { } };
            header.Controls.Add(contact);
            header.Resize += (s, e) => contact.Location = new Point(header.ClientSize.Width - 24 - contact.Width, (header.Height - contact.Height) / 2);

            var body = new Panel { Dock = DockStyle.Fill, Padding = new Padding(24, 20, 24, 16), BackColor = PageBack };

            // --- Карточка поиска ---
            var searchCard = new Panel { Dock = DockStyle.Top, Height = 168, BackColor = Color.White, Padding = new Padding(20, 14, 20, 14) };
            searchCard.Paint += PaintCardBorder;

            var kicker = new Label { Text = "БЛОКИ ПИТАНИЯ НА DIN-РЕЙКУ", AutoSize = true, Location = new Point(21, 16), ForeColor = Accent, Font = new Font(Font.FontFamily, 8.5f, FontStyle.Bold) };
            var title = new Label { Text = "Подбор", Font = new Font(Font.FontFamily, 18f, FontStyle.Bold), AutoSize = true, Location = new Point(18, 34), ForeColor = TextMain };
            var title2 = new Label { Text = "аналога TETTAPRO", Font = new Font(Font.FontFamily, 18f, FontStyle.Bold), AutoSize = true, ForeColor = Accent };
            var subtitle = new Label { Text = "Вставьте артикул блока питания другого производителя — бренд определится автоматически", AutoSize = true, Location = new Point(21, 72), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 9f) };

            var brandLabel = new Label { Text = "Бренд", AutoSize = true, Location = new Point(20, 102), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 8.5f) };
            brandHint = new Label { Text = "", AutoSize = true, ForeColor = Accent, Font = new Font(Font.FontFamily, 8.5f) };
            brandBox = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Location = new Point(20, 120), Width = 200, Font = new Font(Font.FontFamily, 11f), FlatStyle = FlatStyle.Flat, MaxDropDownItems = 16, DropDownWidth = 230 };

            var articleLabel = new Label { Text = "Артикул", AutoSize = true, Location = new Point(236, 102), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 8.5f) };
            articleBox = new TextBox { Location = new Point(236, 120), Width = 380, Font = new Font(Font.FontFamily, 11f), BorderStyle = BorderStyle.FixedSingle, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            SetCue(articleBox, "Например: MDR-20-24");
            articleBox.TextChanged += (s, e) => DetectBrand();
            articleBox.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; DoSearch(); } };

            searchButton = new Button { Text = "Поиск", Location = new Point(612, 118), Size = new Size(140, 32), FlatStyle = FlatStyle.Flat, BackColor = Accent, ForeColor = Color.White, Font = new Font(Font.FontFamily, 10.5f, FontStyle.Bold), Cursor = Cursors.Hand, Anchor = AnchorStyles.Top | AnchorStyles.Right };
            searchButton.FlatAppearance.BorderSize = 0;
            searchButton.FlatAppearance.MouseOverBackColor = AccentHover;
            searchButton.Click += (s, e) => DoSearch();

            searchCard.Controls.AddRange(new Control[] { kicker, title, title2, subtitle, brandLabel, brandHint, brandBox, articleLabel, articleBox, searchButton });
            searchCard.Layout += (s, e) =>
            {
                title2.Location = new Point(title.Left + title.PreferredWidth + 6, title.Top);
                brandHint.Location = new Point(brandLabel.Left + brandLabel.PreferredWidth + 2, brandLabel.Top);
            };
            searchCard.Resize += (s, e) =>
            {
                searchButton.Left = searchCard.ClientSize.Width - 20 - searchButton.Width;
                articleBox.Width = searchButton.Left - 16 - articleBox.Left;
            };

            gapResult = new Panel { Dock = DockStyle.Top, Height = 14, BackColor = PageBack };

            // --- Карточка результата ---
            resultCard = new Panel { Dock = DockStyle.Top, Height = 110, BackColor = Color.White, Padding = new Padding(20, 12, 20, 12) };
            resultCard.Paint += PaintResultCard;
            resultCaption = new Label { Text = "АНАЛОГ TETTAPRO", AutoSize = true, Location = new Point(24, 14), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 8.5f, FontStyle.Bold) };
            resultValue = new Label { Text = "—", AutoSize = true, Location = new Point(20, 34), ForeColor = TextMain, Font = new Font(Font.FontFamily, 22f, FontStyle.Bold) };
            resultNote = new Label { Text = "Введите артикул и нажмите «Поиск»", AutoSize = true, Location = new Point(24, 76), ForeColor = TextMuted, Font = new Font(Font.FontFamily, 9f) };
            copyButton = new Button { Text = "Копировать", Size = new Size(140, 34), FlatStyle = FlatStyle.Flat, BackColor = Color.White, ForeColor = Accent, Font = new Font(Font.FontFamily, 9.5f, FontStyle.Bold), Cursor = Cursors.Hand, Anchor = AnchorStyles.Top | AnchorStyles.Right, Visible = false };
            copyButton.FlatAppearance.BorderColor = Accent;
            copyButton.FlatAppearance.MouseOverBackColor = SuccessBack;
            copyButton.Click += (s, e) => CopyResult();
            resultDetails = new Label { Text = "", AutoSize = true, Location = new Point(24, 100), ForeColor = TextMain, Font = new Font(Font.FontFamily, 9.5f) };
            resultCard.Controls.AddRange(new Control[] { resultCaption, resultValue, resultNote, resultDetails, copyButton });
            resultCard.Resize += (s, e) => LayoutResult();

            var gap2 = new Panel { Dock = DockStyle.Top, Height = 14, BackColor = PageBack };

            // --- Таблица ---
            gridCaption = new Label { Text = "ТАБЛИЦА СООТВЕТСТВИЯ", Dock = DockStyle.Top, Height = 26, ForeColor = Accent, Font = new Font(Font.FontFamily, 9f, FontStyle.Bold) };

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
                BorderStyle = BorderStyle.None,
                CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal,
                GridColor = ColorTranslator.FromHtml("#e6ecf1"),
                EnableHeadersVisualStyles = false,
                ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing,
                ColumnHeadersHeight = 34,
                ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.None,
            };
            grid.RowTemplate.Height = 30;
            grid.ColumnHeadersDefaultCellStyle.BackColor = HeaderBack;
            grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.White;
            grid.ColumnHeadersDefaultCellStyle.Font = new Font(Font.FontFamily, 9f, FontStyle.Bold);
            grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = HeaderBack;
            grid.ColumnHeadersDefaultCellStyle.Padding = new Padding(8, 0, 0, 0);
            grid.DefaultCellStyle.Padding = new Padding(8, 0, 0, 0);
            grid.DefaultCellStyle.SelectionBackColor = ColorTranslator.FromHtml("#e1f0fd");
            grid.DefaultCellStyle.ForeColor = TextMain;
            grid.DefaultCellStyle.SelectionForeColor = TextMain;
            grid.Columns.Add("brand", "Бренд");
            grid.Columns.Add("competitor", "Артикул конкурента");
            grid.Columns.Add("tetta", "Аналог TETTAPRO");
            grid.Columns.Add("result", "Результат подбора");
            grid.Columns.Add("conditions", "Отличия и условия замены");
            grid.Columns["brand"].FillWeight = 13;
            grid.Columns["competitor"].FillWeight = 19;
            grid.Columns["tetta"].FillWeight = 14;
            grid.Columns["result"].FillWeight = 18;
            grid.Columns["conditions"].FillWeight = 36;
            grid.ScrollBars = ScrollBars.Vertical;
            grid.ShowCellToolTips = true;   // полный текст длинной ячейки — во всплывающей подсказке
            // Клик по строке — её условия замены выводятся полностью в карточке результата.
            grid.CellClick += (s, e) =>
            {
                if (e.RowIndex < 0 || !resultCard.Visible) return;
                var row = grid.Rows[e.RowIndex];
                var cond = row.Cells["conditions"].Value as string;
                if (string.IsNullOrEmpty(cond)) return;
                resultDetails.Text = row.Cells["brand"].Value + " " + row.Cells["competitor"].Value + " → " + row.Cells["tetta"].Value
                                     + ". Отличия и условия замены: " + cond;
                resultDetails.Visible = true;
                LayoutResult();
            };
            grid.Columns["result"].DefaultCellStyle.ForeColor = TextMuted;
            grid.Columns["tetta"].DefaultCellStyle.Font = new Font(Font.FontFamily, 10f, FontStyle.Bold);
            grid.Columns["tetta"].DefaultCellStyle.ForeColor = Accent;
            grid.CellDoubleClick += (s, e) =>
            {
                if (e.RowIndex < 0) return;
                var v = grid.Rows[e.RowIndex].Cells["tetta"].Value as string;
                if (!string.IsNullOrEmpty(v) && v.StartsWith("MTPR", StringComparison.OrdinalIgnoreCase)) { SafeCopy(v); statusLabel.Text = "Скопировано: " + v; }
            };
            var menu = new ContextMenuStrip();
            menu.Items.Add("Копировать аналог TETTAPRO", null, (s, e) => CopyGridCell("tetta"));
            menu.Items.Add("Копировать артикул конкурента", null, (s, e) => CopyGridCell("competitor"));
            menu.Items.Add("Копировать условия замены", null, (s, e) => CopyGridCell("conditions"));
            grid.ContextMenuStrip = menu;

            // Порядок добавления: элементы с Dock=Top добавляются в обратном порядке.
            body.Controls.Add(grid);
            body.Controls.Add(gridCaption);
            body.Controls.Add(gap2);
            body.Controls.Add(resultCard);
            body.Controls.Add(gapResult);
            body.Controls.Add(searchCard);

            Controls.Add(body);
            Controls.Add(status);
            Controls.Add(header);

            brandBox.SelectedIndexChanged += (s, e) =>
            {
                if (settingBrand) return;
                brandHint.Text = "";
                if (articleBox.Text.Trim().Length > 0) DoSearch();
            };
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
                int h = 34;
                int w = (int)(customLogo.Width * (h / (double)customLogo.Height));
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(customLogo, new Rectangle(x, (header.Height - h) / 2, w, h));
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

            using (var line = new Pen(HeaderLine)) g.DrawLine(line, 0, header.Height - 1, header.Width, header.Height - 1);
            using (var f = new Font(Font.FontFamily, 9.5f))
            using (var b = new SolidBrush(HeaderText))
            {
                var text = "Подбор аналогов блоков питания";
                var sz = g.MeasureString(text, f);
                float tx = header.Width - sz.Width - 24 - 150 - 20;
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
            Color border = resultState == 1 ? SuccessBorder : resultState == 2 ? WarnBorder : CardBorder;
            using (var pen = new Pen(CardBorder)) e.Graphics.DrawRectangle(pen, 0, 0, c.Width - 1, c.Height - 1);
            using (var b = new SolidBrush(border)) e.Graphics.FillRectangle(b, 0, 0, 5, c.Height);
        }

        void SetResult(int state, string caption, string value, string note, bool canCopy, string details = null)
        {
            resultState = state;
            resultCard.BackColor = state == 1 ? SuccessBack : state == 2 ? WarnBack : Color.White;
            resultCaption.Text = caption;
            resultValue.Text = value;
            resultValue.ForeColor = state == 2 ? TextMuted : TextMain;
            resultValue.Font = new Font(Font.FontFamily, state == 2 ? 15f : 22f, FontStyle.Bold);
            resultCard.Visible = gapResult.Visible = true;
            resultValue.Top = state == 2 ? 38 : 32;
            resultNote.Text = note;
            resultDetails.Text = details ?? "";
            resultDetails.Visible = resultDetails.Text.Length > 0;
            copyButton.Visible = canCopy;
            LayoutResult();
            resultCard.Invalidate();
        }

        /// <summary>Раскладка карточки результата: текст переносится, высота подстраивается.</summary>
        void LayoutResult()
        {
            int w = resultCard.ClientSize.Width;
            copyButton.Location = new Point(w - 20 - copyButton.Width, 36);
            int textW = Math.Max(200, w - 48);
            resultNote.MaximumSize = new Size(copyButton.Visible ? Math.Max(200, copyButton.Left - 40) : textW, 0);
            resultDetails.MaximumSize = new Size(textW, 0);
            resultNote.Top = resultValue.Top + resultValue.PreferredHeight + 2;
            resultDetails.Top = resultNote.Top + resultNote.PreferredHeight + 8;
            int bottom = resultDetails.Visible ? resultDetails.Top + resultDetails.PreferredHeight : resultNote.Top + resultNote.PreferredHeight;
            resultCard.Height = Math.Max(110, bottom + 16);
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

            ResetView();
            UpdateStatus();
        }

        void UpdateStatus()
        {
            statusLabel.Text = string.Format("База: {0} позиций, брендов: {1} · источник: {2}",
                table.Pairs.Count, table.Brands.Count, table.Source);
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

        /// <summary>Начальный вид: только поиск, без результата и таблицы.</summary>
        void ResetView()
        {
            grid.Rows.Clear();
            SetTableVisible(false);
            resultCard.Visible = gapResult.Visible = false;
        }

        /// <summary>По введённому артикулу сам выбирает бренд в списке.</summary>
        void DetectBrand()
        {
            var q = articleBox.Text.Trim();
            if (q.Length == 0) { brandHint.Text = ""; ResetView(); return; }
            var r = table.Search(q, null);
            if (!r.Exact || r.Reverse) return;
            var brands = r.Matches.Select(m => m.Brand).Distinct().ToList();
            SelectBrand(brands.Count == 1 ? brands[0] : AllBrands,
                        brands.Count == 1 ? "  · определён автоматически" : "  · у нескольких брендов");
        }

        void SelectBrand(string brand, string hint)
        {
            int idx = brandBox.Items.IndexOf(brand);
            if (idx < 0) return;
            settingBrand = true;
            try { brandBox.SelectedIndex = idx; } finally { settingBrand = false; }
            brandHint.Text = hint;
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
            foreach (var p in pairs)
            {
                int i = grid.Rows.Add(p.Brand, p.Competitor, p.NoAnalog ? "Нет аналога" : p.TettaPro, p.Result ?? "", p.Conditions ?? "");
                if (p.NoAnalog)
                {
                    grid.Rows[i].Cells["tetta"].Style.ForeColor = TextMuted;
                    grid.Rows[i].Cells["tetta"].Style.Font = new Font(Font.FontFamily, 9.5f, FontStyle.Italic);
                }
            }
            grid.ClearSelection();
        }

        void DoSearch()
        {
            var q = articleBox.Text.Trim();
            if (q.Length == 0) { ResetView(); return; }

            var r = table.Search(q, SelectedBrand);
            if (r.Matches.Count == 0 && SelectedBrand != null)
            {
                // У выбранного бренда такого артикула нет — ищем по всем брендам.
                var all = table.Search(q, null);
                if (all.Matches.Count > 0)
                {
                    var brands = all.Matches.Select(m => m.Brand).Distinct().ToList();
                    SelectBrand(brands.Count == 1 ? brands[0] : AllBrands, brands.Count == 1 ? "  · определён автоматически" : "");
                    r = table.Search(q, SelectedBrand);
                }
            }
            if (r.Matches.Count == 0)
            {
                grid.Rows.Clear();
                SetTableVisible(false);
                SetResult(2, "НЕ НАЙДЕНО", "Аналог для «" + q + "» не найден",
                    "Проверьте артикул или напишите нам на почту " + Email + " для уточнения замены.", false);
                return;
            }

            if (r.Matches.All(m => m.NoAnalog) && (r.Exact || r.Matches.Count == 1))
            {
                // Позиция есть в базе, но аналога TETTAPRO для неё нет.
                var m0 = r.Matches[0];
                var info = JoinResults(r.Matches);
                var cond = JoinConditions(r.Matches);
                grid.Rows.Clear();
                SetTableVisible(false);
                SetResult(2, "АНАЛОГ TETTAPRO ДЛЯ " + m0.Brand.ToUpperInvariant() + " " + m0.Competitor,
                    "Аналога TETTAPRO нет" + (info.Length > 0 ? " — " + info.ToLowerInvariant() : ""),
                    cond.Length > 0 ? cond : "Напишите нам на почту " + Email + " для уточнения замены.", false,
                    cond.Length > 0 ? "Напишите нам на почту " + Email + " для уточнения замены." : null);
                return;
            }

            FillGrid(r.Matches);

            if (r.Exact && !r.Reverse)
            {
                var found = r.Matches.Where(m => !m.NoAnalog).ToList();
                var analogs = found.Select(m => m.TettaPro).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                var brands = r.Matches.Select(m => m.Brand).Distinct().ToList();
                var src = r.Matches[0];

                if (brands.Count > 1)
                {
                    bool same = analogs.Count == 1 && found.Count == r.Matches.Count;
                    SetResult(1, "АНАЛОГ TETTAPRO ДЛЯ " + src.Competitor.ToUpperInvariant(),
                        string.Join("  /  ", analogs),
                        same ? "Артикул есть у брендов: " + string.Join(", ", brands) + ". Нажмите на строку таблицы, чтобы увидеть условия замены."
                             : "Аналог зависит от бренда (" + string.Join(", ", brands) + ") — выберите бренд или нажмите на строку таблицы.",
                        same);
                }
                else
                {
                    var info = JoinResults(found);
                    string note = info.Length > 0 ? "Результат подбора: " + info
                                                  : "Нажмите «Копировать», чтобы вставить артикул в заказ";
                    if (analogs.Count > 1 && info.Length == 0) note = "Подходит любой из вариантов";
                    var cond = JoinConditions(found);
                    SetResult(1, "АНАЛОГ TETTAPRO ДЛЯ " + src.Brand.ToUpperInvariant() + " " + src.Competitor,
                        string.Join("  /  ", analogs), note, true,
                        cond.Length > 0 ? "Отличия и условия замены: " + cond : null);
                }
            }
            else if (r.Exact && r.Reverse)
            {
                var comps = r.Matches.Select(m => m.Competitor).Distinct().ToList();
                SetResult(1, "АРТИКУЛ TETTAPRO " + r.Matches[0].TettaPro + " ЗАМЕНЯЕТ",
                    comps.Count <= 3 ? string.Join("  /  ", comps) : "Моделей: " + comps.Count,
                    "Это артикул TETTAPRO — модели, которые он заменяет, показаны в таблице ниже", false);
            }
            else
            {
                var one = r.Matches.Count == 1 ? r.Matches[0] : null;
                var oneInfo = one != null && !string.IsNullOrEmpty(one.Result) ? " · " + one.Result : "";
                SetResult(one != null ? 1 : 0,
                    "ПОХОЖИЕ АРТИКУЛЫ",
                    one != null ? one.TettaPro : "Найдено вариантов: " + r.Matches.Count,
                    one != null ? "Ближайшее совпадение: " + one.Brand + " " + one.Competitor + oneInfo
                                : "Точного совпадения нет — выберите нужную строку в таблице ниже",
                    one != null && !one.NoAnalog,
                    one != null && !string.IsNullOrEmpty(one.Conditions) ? "Отличия и условия замены: " + one.Conditions : null);
            }
        }

        static string JoinConditions(IEnumerable<AnalogPair> pairs)
        {
            return string.Join(" ", pairs.Select(p => (p.Conditions ?? "").Trim()).Where(x => x.Length > 0)
                                         .Distinct(StringComparer.OrdinalIgnoreCase));
        }

        static string JoinResults(IEnumerable<AnalogPair> pairs)
        {
            return string.Join("; ", pairs.Select(p => (p.Result ?? "").Trim()).Where(x => x.Length > 0)
                                          .Distinct(StringComparer.OrdinalIgnoreCase));
        }

        void CopyResult()
        {
            var r = table.Search(articleBox.Text.Trim(), SelectedBrand);
            var found = r.Matches.Where(m => !m.NoAnalog).ToList();
            var text = found.Count > 0 ? string.Join(", ", found.Select(m => m.TettaPro).Distinct()) : resultValue.Text;
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
