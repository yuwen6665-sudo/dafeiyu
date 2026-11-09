using System;
using System.Runtime.InteropServices;
using System.Threading;

// 持续输出鼠标全局坐标（每 50ms 一行："x y"），给 Electron 主进程判断是否该接管鼠标
class CW {
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    static void Main() {
        try { SetProcessDPIAware(); } catch { }
        POINT p;
        while (true) {
            if (GetCursorPos(out p)) Console.WriteLine(p.X + " " + p.Y);
            Console.Out.Flush();
            Thread.Sleep(50);
        }
    }
}