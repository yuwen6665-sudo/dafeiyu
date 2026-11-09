// watcher.exe <标题关键字>
// 1) 只在桌面可见时把挂件提到最上层，切到别的程序就沉到底层
// 2) 读 pet-bounds.json，鼠标落在她身上时去掉点击穿透，其余时候整窗穿透
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class Watcher
{
    private delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT p);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    private static readonly IntPtr HWND_TOP = IntPtr.Zero;
    private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int WS_EX_TOOLWINDOW = 0x00000080;

    private static IntPtr Find(string kw)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, l) =>
        {
            var sb = new StringBuilder(300);
            GetWindowTextW(h, sb, 300);
            if (IsWindowVisible(h) && sb.ToString().Contains(kw)) { found = h; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    private static bool IsDesktopForeground()
    {
        IntPtr fg = GetForegroundWindow();
        if (fg == IntPtr.Zero) return true;
        var cls = new StringBuilder(200);
        GetClassNameW(fg, cls, 200);
        string c = cls.ToString();
        return c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "SysListView32";
    }

    private static int Main(string[] args)
    {
        string kw = args.Length > 0 ? args[0] : "于笙";
        string boundsFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "pet-bounds.json");

        for (;;)
        {
            IntPtr h = Find(kw);
            if (h == IntPtr.Zero) { Thread.Sleep(500); continue; }

            if (IsIconic(h)) ShowWindow(h, 9);

            bool overPet = false;
            try
            {
                if (File.Exists(boundsFile))
                {
                    string txt;
                    using (var fs = new FileStream(boundsFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (var sr = new StreamReader(fs))
                    {
                        txt = sr.ReadToEnd();
                    }
                    double l = 0, t = 0, r = 0, b = 0, dpr = 1;
                    foreach (var part in txt.Trim('{', '}', ' ').Split(','))
                    {
                        var kv = part.Split(':');
                        if (kv.Length != 2) continue;
                        string k = kv[0].Trim().Trim('"');
                        double v;
                        if (!double.TryParse(kv[1].Trim(), out v)) continue;
                        if (k == "l") l = v;
                        else if (k == "t") t = v;
                        else if (k == "r") r = v;
                        else if (k == "b") b = v;
                        else if (k == "dpr") dpr = v;
                    }
                    POINT p;
                    if (GetCursorPos(out p))
                    {
                        // 留 20px 边距，好点
                        overPet = p.X >= l * dpr - 20 && p.X <= r * dpr + 20
                               && p.Y >= t * dpr - 20 && p.Y <= b * dpr + 20;
                    }
                }
            }
            catch { }

            int ex = GetWindowLong(h, GWL_EXSTYLE);
            int want = overPet
                ? (ex & ~WS_EX_TRANSPARENT) | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW
                : ex | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW;
            if (want != ex) SetWindowLong(h, GWL_EXSTYLE, want);

            if (IsDesktopForeground() || overPet)
                SetWindowPos(h, HWND_TOP, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
            else
                SetWindowPos(h, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);

            Thread.Sleep(30);
        }
    }
}
