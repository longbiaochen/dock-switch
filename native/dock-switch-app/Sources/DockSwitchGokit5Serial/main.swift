import Darwin
import Foundation

let port = CommandLine.arguments.dropFirst().first ?? ""
guard !port.isEmpty else {
    fputs("usage: DockSwitchGokit5Serial /dev/cu.usbmodemXXXX\n", stderr)
    exit(2)
}

let fd = Darwin.open(port, O_RDWR | O_NOCTTY | O_NONBLOCK)
guard fd >= 0 else {
    fputs("open failed: \(String(cString: strerror(errno)))\n", stderr)
    exit(1)
}
defer { Darwin.close(fd) }

func runStty() {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/stty")
    process.arguments = ["-f", port, "115200", "raw", "-echo", "-icanon", "min", "1", "time", "0", "clocal", "-hupcl"]
    do {
        try process.run()
        process.waitUntilExit()
    } catch {
        fputs("stty failed: \(error.localizedDescription)\n", stderr)
    }
}

func setLine(_ bit: Int32, enabled: Bool) {
    var mutableBit = bit
    let tiocmbis = UInt(2_147_775_596)
    let tiocmbic = UInt(2_147_775_595)
    _ = ioctl(fd, enabled ? tiocmbis : tiocmbic, &mutableBit)
}

func resetUsbSerial() {
    let sequence: [(Bool, Bool)] = [
        (false, false),
        (false, true),
        (false, false),
    ]
    for (dtr, rts) in sequence {
        setLine(TIOCM_DTR, enabled: dtr)
        setLine(TIOCM_RTS, enabled: rts)
        usleep(200_000)
    }
}

runStty()
fputs("helper:stty\n", stderr)
resetUsbSerial()
fputs("helper:reset\n", stderr)

var buffer = [UInt8](repeating: 0, count: 4096)
while true {
    let count = Darwin.read(fd, &buffer, buffer.count)
    if count > 0 {
        fputs("helper:read:\(count)\n", stderr)
        FileHandle.standardOutput.write(Data(buffer.prefix(count)))
        fflush(stdout)
        continue
    }
    if count == 0 {
        exit(0)
    }
    if errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR {
        usleep(50_000)
        continue
    }
    fputs("read failed: \(String(cString: strerror(errno)))\n", stderr)
    exit(1)
}
