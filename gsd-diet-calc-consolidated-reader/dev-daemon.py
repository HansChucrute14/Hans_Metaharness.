#!/usr/bin/env python3
"""Double-fork daemon launcher + watchdog for the Next.js dev server.

The sandbox reaps background processes whose parent shell has exited.
A double-fork reparents the daemon to init (pid 1), so it survives across
Bash tool calls. The watchdog loop restarts `next dev` if it crashes
(e.g. kernel OOM-kill under memory pressure).
"""
import os
import sys
import time
import subprocess
import signal

PROJECT = "/home/z/my-project"
NEXT_BIN = os.path.join(PROJECT, "node_modules", ".bin", "next")
DEVLOG = os.path.join(PROJECT, "dev.log")
WATCHLOG = os.path.join(PROJECT, "dev-watchdog.log")
PORT = 3000


def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    with open(WATCHLOG, "a") as f:
        f.write(f"[{ts}] {msg}\n")


def write_pid(pid: int) -> None:
    with open(os.path.join(PROJECT, ".dev-daemon.pid"), "w") as f:
        f.write(str(pid))


def watchdog() -> None:
    # We are now pid 1's child (reparented). Run the server, restart on exit.
    write_pid(os.getpid())
    log(f"watchdog started pid={os.getpid()} ppid={os.getppid()}")
    while True:
        log("booting next-server...")
        try:
            with open(DEVLOG, "a") as devf:
                proc = subprocess.Popen(
                    [NEXT_BIN, "dev", "-p", str(PORT)],
                    cwd=PROJECT,
                    stdout=devf,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    # Put next in its own process group so we can clean up children
                    preexec_fn=os.setsid,
                )
        except Exception as e:
            log(f"failed to spawn next: {e}; retrying in 5s")
            time.sleep(5)
            continue
        rc = proc.wait()
        log(f"next-server exited rc={rc}; restarting in 3s")
        # Reap any orphaned next-server children
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception:
            pass
        time.sleep(3)


def main() -> None:
    # --- first fork ---
    pid = os.fork()
    if pid > 0:
        # parent exits immediately
        sys.exit(0)
    os.setsid()
    # --- second fork ---
    pid = os.fork()
    if pid > 0:
        sys.exit(0)
    # detach from controlling terminal, redirect std fds
    os.chdir(PROJECT)
    os.umask(0)
    fd = os.open(os.devnull, os.O_RDWR)
    os.dup2(fd, 0)
    os.dup2(fd, 1)
    os.dup2(fd, 2)
    if fd > 2:
        os.close(fd)
    watchdog()


if __name__ == "__main__":
    main()
