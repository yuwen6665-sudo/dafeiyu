using System;
using System.Runtime.InteropServices;
using System.Text;

class FS {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
        public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
    }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr mon, ref MONITORINFO mi);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    static bool IsIgnored(string cls) {
        return cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" ||
               cls == "Shell_SecondaryTrayWnd";
    }

    static void Main() {
        try { SetProcessDPIAware(); } catch { }
        IntPtr h = GetForegroundWindow();
        if (h == IntPtr.Zero) { Console.WriteLine("0"); return; }
        var sb = new StringBuilder(256);
        GetClassName(h, sb, 256);
        string cls = sb.ToString();
        if (IsIgnored(cls)) { Console.WriteLine("0"); return; }

        RECT r;
        if (!GetWindowRect(h, out r)) { Console.WriteLine("0"); return; }

        IntPtr mon = MonitorFromWindow(h, 2);
        var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi);
        if (!GetMonitorInfo(mon, ref mi)) { Console.WriteLine("0"); return; }

        int mw = mi.rcMonitor.R - mi.rcMonitor.L;
        int mh = mi.rcMonitor.B - mi.rcMonitor.T;
        int ww = r.R - r.L;
        int wh = r.B - r.T;

        bool covers = ww >= mw * 0.95 && wh >= mh * 0.95 &&
                      Math.Abs(r.L - mi.rcMonitor.L) < 4 && Math.Abs(r.T - mi.rcMonitor.T) < 4;
        Console.WriteLine(covers ? "1" : "0");
    }
}