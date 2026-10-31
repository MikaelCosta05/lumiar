// Grava o som de um programa (com os processos filhos dele) num WAV separado, ou o som de tudo menos esse programa.
// Usa a captura por processo do Windows 10 2004+ (AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK).
//
//   lumiar-audio list                                  programas abertos, em JSON: [{"pid":1,"name":"Discord","title":"…"}]
//   lumiar-audio capture <pid> include|exclude <wav>   grava até receber uma linha (ou o fim) na entrada
//
// Durante a gravação escreve "started <hora em ms desde 1970>" quando o primeiro som pode chegar e "done" no fim.
// Compilado pelo csc.exe que vem com o .NET Framework 4 (scripts/build-app-audio.cjs): só C# 5.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace Lumiar
{
    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
        [PreserveSig] int GetBufferSize(out uint frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint frames);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr handle);
        [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint frames);
        [PreserveSig] int GetNextPacketSize(out uint frames);
    }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceAsyncOperation
    {
        void GetActivateResult(out int result, [MarshalAs(UnmanagedType.IUnknown)] out object activated);
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceCompletionHandler
    {
        void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation);
    }

    // O Windows só chama de volta objetos "ágeis" (que funcionam em qualquer thread).
    [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAgileObject { }

    // Como no exemplo da Microsoft (ApplicationLoopback), o dispositivo é inicializado aqui dentro, na resposta.
    class Activation : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent Done = new ManualResetEvent(false);
        public IntPtr Format;
        public uint Flags;
        public int Result;
        public string Step = "ActivateAudioInterfaceAsync";
        public IAudioClient Client;

        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation)
        {
            try
            {
                object activated;
                operation.GetActivateResult(out Result, out activated);
                if (Result >= 0)
                {
                    Client = (IAudioClient)activated;
                    Step = "Initialize";
                    Result = Client.Initialize(0, Flags, 2000000, 0, Format, IntPtr.Zero);
                }
            }
            catch (Exception error)
            {
                Result = Marshal.GetHRForException(error);
            }
            finally
            {
                Done.Set();
            }
        }
    }

    static class Program
    {
        [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
        static extern void ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
            ref Guid iid,
            IntPtr activationParams,
            IActivateAudioInterfaceCompletionHandler handler,
            out IActivateAudioInterfaceAsyncOperation operation);

        const int RATE = 48000;
        const int CHANNELS = 2;
        const int BLOCK = CHANNELS * 2;

        [MTAThread]
        static int Main(string[] args)
        {
            try
            {
                Console.OutputEncoding = new UTF8Encoding(false);
                if (args.Length == 1 && args[0] == "list")
                {
                    Console.Out.Write(ListApps());
                    return 0;
                }
                if (args.Length == 4 && args[0] == "capture")
                    return Capture(uint.Parse(args[1]), args[2] == "exclude", args[3]);
                Console.Error.WriteLine("uso: lumiar-audio list | capture <pid> include|exclude <arquivo.wav>");
                return 2;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error.Message);
                return 1;
            }
        }

        // ------------------------------------------------------------------ Programas abertos

        // Um item por programa: o processo de cima da árvore com o mesmo nome (o Discord abre vários Discord.exe e o
        // som sai de um dos filhos; gravar a árvore a partir do de cima pega todos).
        static readonly string[] VOICE = { "discord", "discordptb", "discordcanary" };
        // Janelas do próprio Windows, que não tocam som.
        static readonly string[] SYSTEM = {
            "explorer", "textinputhost", "applicationframehost", "systemsettings", "shellexperiencehost", "searchhost",
            "startmenuexperiencehost", "lockapp", "widgets", "lumiar-audio",
        };

        static string ListApps()
        {
            var names = new Dictionary<uint, string>();
            var parents = new Dictionary<uint, uint>();
            using (var search = new ManagementObjectSearcher("SELECT ProcessId, ParentProcessId, Name FROM Win32_Process"))
                foreach (ManagementObject p in search.Get())
                {
                    uint id = (uint)p["ProcessId"];
                    names[id] = Path.GetFileNameWithoutExtension((string)p["Name"] ?? "");
                    parents[id] = (uint)p["ParentProcessId"];
                }

            var titles = new Dictionary<uint, string>();
            foreach (var p in Process.GetProcesses())
            {
                try
                {
                    // O Discord minimizado na bandeja não tem janela, mas ainda é o que mais se quer gravar.
                    bool voice = Array.IndexOf(VOICE, p.ProcessName.ToLowerInvariant()) >= 0;
                    bool system = Array.IndexOf(SYSTEM, p.ProcessName.ToLowerInvariant()) >= 0;
                    if (!system && p.SessionId == Process.GetCurrentProcess().SessionId && (p.MainWindowHandle != IntPtr.Zero || voice))
                    {
                        uint root = (uint)p.Id;
                        uint parent;
                        string name;
                        while (parents.TryGetValue(root, out parent) && names.TryGetValue(parent, out name) && name == names[root] && parent != root)
                            root = parent;
                        string title = p.MainWindowTitle ?? "";
                        string known;
                        if (!titles.TryGetValue(root, out known) || known.Length == 0) titles[root] = title;
                    }
                }
                catch (Exception)
                {
                    // Processo que fechou no meio da lista, ou de outro usuário.
                }
                finally
                {
                    p.Dispose();
                }
            }

            uint self = (uint)Process.GetCurrentProcess().Id;
            var json = new StringBuilder("[");
            foreach (var entry in titles)
            {
                string name;
                if (entry.Key == self || !names.TryGetValue(entry.Key, out name) || name.Length == 0) continue;
                if (json.Length > 1) json.Append(',');
                json.Append("{\"pid\":").Append(entry.Key).Append(",\"name\":").Append(Quote(name)).Append(",\"title\":").Append(Quote(entry.Value)).Append('}');
            }
            return json.Append(']').ToString();
        }

        static string Quote(string text)
        {
            var s = new StringBuilder("\"");
            foreach (char c in text)
            {
                if (c == '"' || c == '\\') s.Append('\\').Append(c);
                else if (c < ' ') s.Append("\\u").Append(((int)c).ToString("x4"));
                else s.Append(c);
            }
            return s.Append('"').ToString();
        }

        // ------------------------------------------------------------------ Gravação

        static int Capture(uint pid, bool exclude, string path)
        {
            // 48 kHz, estéreo, 16 bits: o Windows converte o que o programa tocar para isso.
            IntPtr format = Marshal.AllocHGlobal(18);
            byte[] wave = new byte[18];
            BitConverter.GetBytes((ushort)1).CopyTo(wave, 0);
            BitConverter.GetBytes((ushort)CHANNELS).CopyTo(wave, 2);
            BitConverter.GetBytes(RATE).CopyTo(wave, 4);
            BitConverter.GetBytes(RATE * BLOCK).CopyTo(wave, 8);
            BitConverter.GetBytes((ushort)BLOCK).CopyTo(wave, 12);
            BitConverter.GetBytes((ushort)16).CopyTo(wave, 14);
            Marshal.Copy(wave, 0, format, 18);
            IAudioClient client;
            try
            {
                client = Activate(pid, exclude, format);
            }
            finally
            {
                Marshal.FreeHGlobal(format);
            }

            Guid captureId = typeof(IAudioCaptureClient).GUID;
            object service;
            Check(client.GetService(ref captureId, out service), "GetService");
            var capture = (IAudioCaptureClient)service;

            var stop = new ManualResetEvent(false);
            var reader = new Thread(() =>
            {
                try { Console.In.ReadLine(); } catch (Exception) { }
                stop.Set();
            });
            reader.IsBackground = true;
            reader.Start();

            using (var file = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.Read, 1 << 16))
            {
                file.Write(new byte[44], 0, 44);
                Check(client.Start(), "Start");
                var clock = Stopwatch.StartNew();
                Console.Out.WriteLine("started " + (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds);
                Console.Out.Flush();

                long written = 0;
                byte[] buffer = new byte[RATE * BLOCK];
                byte[] silence = new byte[RATE * BLOCK / 10];
                while (!stop.WaitOne(10))
                {
                    uint packet;
                    while (capture.GetNextPacketSize(out packet) == 0 && packet > 0)
                    {
                        IntPtr data;
                        uint frames, flags;
                        ulong devicePosition, qpc;
                        Check(capture.GetBuffer(out data, out frames, out flags, out devicePosition, out qpc), "GetBuffer");
                        if (frames == 0)
                        {
                            capture.ReleaseBuffer(0);
                            break;
                        }
                        int bytes = (int)frames * BLOCK;
                        if (bytes > buffer.Length) buffer = new byte[bytes];
                        // Pacote marcado como silêncio: o conteúdo do buffer não vale, são zeros.
                        if ((flags & 0x2) != 0) Array.Clear(buffer, 0, bytes);
                        else Marshal.Copy(data, buffer, 0, bytes);
                        capture.ReleaseBuffer(frames);
                        file.Write(buffer, 0, bytes);
                        written += frames;
                    }
                    // Quando o programa fica calado o Windows não entrega nada: completa com silêncio para o som
                    // continuar no tempo certo em relação à gravação da tela.
                    long now = (long)(clock.Elapsed.TotalSeconds * RATE);
                    if (written < now - RATE / 4) written = PadTo(file, silence, written, now - RATE / 20);
                }
                client.Stop();
                written = PadTo(file, silence, written, (long)(clock.Elapsed.TotalSeconds * RATE));
                WriteHeader(file, written * BLOCK);
            }
            Console.Out.WriteLine("done");
            return 0;
        }

        static long PadTo(FileStream file, byte[] silence, long written, long target)
        {
            while (written < target)
            {
                int frames = (int)Math.Min(target - written, silence.Length / BLOCK);
                file.Write(silence, 0, frames * BLOCK);
                written += frames;
            }
            return written;
        }

        static IAudioClient Activate(uint pid, bool exclude, IntPtr format)
        {
            // AUDIOCLIENT_ACTIVATION_PARAMS: tipo (1 = por processo), processo, modo (0 = com os filhos, 1 = todos menos ele).
            IntPtr parameters = Marshal.AllocHGlobal(12);
            Marshal.WriteInt32(parameters, 0, 1);
            Marshal.WriteInt32(parameters, 4, (int)pid);
            Marshal.WriteInt32(parameters, 8, exclude ? 1 : 0);
            // PROPVARIANT do tipo VT_BLOB (65) apontando para os parâmetros.
            IntPtr variant = Marshal.AllocHGlobal(24);
            for (int i = 0; i < 24; i += 4) Marshal.WriteInt32(variant, i, 0);
            Marshal.WriteInt16(variant, 0, 65);
            Marshal.WriteInt32(variant, 8, 12);
            Marshal.WriteIntPtr(variant, 8 + IntPtr.Size, parameters);
            try
            {
                const uint LOOPBACK = 0x00020000, AUTOCONVERT = 0x80000000, SRC_QUALITY = 0x08000000;
                var activation = new Activation { Format = format, Flags = LOOPBACK | AUTOCONVERT | SRC_QUALITY };
                Guid iid = typeof(IAudioClient).GUID;
                IActivateAudioInterfaceAsyncOperation operation;
                ActivateAudioInterfaceAsync("VAD\\Process_Loopback", ref iid, variant, activation, out operation);
                if (!activation.Done.WaitOne(10000)) throw new Exception("O Windows não respondeu ao pedido de gravar o som do programa.");
                Check(activation.Result, activation.Step);
                GC.KeepAlive(operation);
                return activation.Client;
            }
            finally
            {
                Marshal.FreeHGlobal(variant);
                Marshal.FreeHGlobal(parameters);
            }
        }

        static void WriteHeader(FileStream file, long dataBytes)
        {
            var header = new byte[44];
            Encoding.ASCII.GetBytes("RIFF").CopyTo(header, 0);
            BitConverter.GetBytes((uint)(36 + dataBytes)).CopyTo(header, 4);
            Encoding.ASCII.GetBytes("WAVEfmt ").CopyTo(header, 8);
            BitConverter.GetBytes(16).CopyTo(header, 16);
            BitConverter.GetBytes((ushort)1).CopyTo(header, 20);
            BitConverter.GetBytes((ushort)CHANNELS).CopyTo(header, 22);
            BitConverter.GetBytes(RATE).CopyTo(header, 24);
            BitConverter.GetBytes(RATE * BLOCK).CopyTo(header, 28);
            BitConverter.GetBytes((ushort)BLOCK).CopyTo(header, 32);
            BitConverter.GetBytes((ushort)16).CopyTo(header, 34);
            Encoding.ASCII.GetBytes("data").CopyTo(header, 36);
            BitConverter.GetBytes((uint)dataBytes).CopyTo(header, 40);
            file.Seek(0, SeekOrigin.Begin);
            file.Write(header, 0, 44);
        }

        static void Check(int hr, string what)
        {
            if (hr < 0) throw new Exception(what + " falhou (0x" + hr.ToString("X8") + ")");
        }
    }
}
