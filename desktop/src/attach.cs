// attach.exe <窗口标题关键字>
// 把一个普通窗口挂到 Windows 壁纸层（WorkerW），并铺满屏幕
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class Attach
{
    private delegate bool EnumProc(IntPtr h, IntPtr l);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string c, string w);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string w);
    [DllImport("user32.dll")] private static extern bool SetParent(IntPtr c, IntPtr p);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] private static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int L, T, R, B; }

    private static int Main(string[] args)
    {
        if (args.Length < 1) { Console.WriteLine("usage: attach.exe <title>"); return 2; }
        string kw = args[0];
        SetProcessDPIAware();

        IntPtr hwnd = IntPtr.Zero;
        for (int i = 0; i < 40 && hwnd == IntPtr.Zero; i++)
        {
            EnumWindows((h, l) =>
            {
                var sb = new StringBuilder(300);
                GetWindowTextW(h, sb, 300);
                if (sb.ToString().Contains(kw)) { hwnd = h; return false; }
                return true;
            }, IntPtr.Zero);
            if (hwnd == IntPtr.Zero) Thread.Sleep(200);
        }
        if (hwnd == IntPtr.Zero) { Console.WriteLine("window not found"); return 3; }

        IntPtr progman = FindWindow("Progman", "Program Manager");
        IntPtr res;
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out res);

        IntPtr worker = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        if (worker == IntPtr.Zero)
        {
            IntPtr found = IntPtr.Zero;
            EnumWindows((h, l) =>
            {
                if (FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                    found = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
                return true;
            }, IntPtr.Zero);
            worker = found;
        }
        if (worker == IntPtr.Zero) worker = progman;

        SetParent(hwnd, worker);
        int style = GetWindowLong(hwnd, -16);
        SetWindowLong(hwnd, -16, style | 0x40000000);

        RECT wr;
        GetWindowRect(worker, out wr);
        int w = wr.R - wr.L, hh = wr.B - wr.T;
        if (w <= 0 || hh <= 0) { w = 2560; hh = 1600; }

        ShowWindow(worker, 5);
        ShowWindow(hwnd, 5);
        SetWindowPos(hwnd, IntPtr.Zero, 0, 0, w, hh, 0x0040);

        Console.WriteLine("attached hwnd=" + hwnd.ToInt64() + " worker=" + worker.ToInt64() + " size=" + w + "x" + hh);
        return 0;
    }
}
