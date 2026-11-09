// bottom.exe <标题关键字>  —— 把窗口压到最底层（桌面挂件模式），并加 NOACTIVATE
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class Bottom
{
    private delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr h, int i, int v);

    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;

    private static int Main(string[] args)
    {
        if (args.Length < 1) return 2;
        string kw = args[0];
        IntPtr hwnd = IntPtr.Zero;
        EnumWindows((h, l) =>
        {
            var sb = new StringBuilder(300);
            GetWindowTextW(h, sb, 300);
            if (IsWindowVisible(h) && sb.ToString().Contains(kw)) { hwnd = h; return false; }
            return true;
        }, IntPtr.Zero);
        if (hwnd == IntPtr.Zero) { Console.WriteLine("not found"); return 3; }

        int ex = GetWindowLong(hwnd, GWL_EXSTYLE);
        SetWindowLong(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
        SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
        Console.WriteLine("bottom ok");
        return 0;
    }
}
