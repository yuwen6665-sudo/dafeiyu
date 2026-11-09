using System;
using System.Runtime.InteropServices;
using System.Threading;

// 输出 "x y b"（b=1 表示鼠标左键按下），每 50ms 一行
class CW {
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    static void Main() {
        try { SetProcessDPIAware(); } catch { }
        POINT p;
        while (true) {
            int b = (GetAsyncKeyState(0x01) & 0x8000) != 0 ? 1 : 0;
            if (GetCursorPos(out p)) Console.WriteLine(p.X + " " + p.Y + " " + b);
            Console.Out.Flush();
            Thread.Sleep(50);
        }
    }
}