#!/usr/bin/env python3
"""Continuous HLS playlist/segment fetch for continuity verification."""
import re
import statistics
import time
import urllib.request
from datetime import datetime, timezone

BASE = (
    "http://127.0.0.1:8888/live/"
    "6a598e63a0378a21deb61a3b/6a598e63a0378a21deb61a3b"
)
DURATION = 300
INTERVAL = 4
RESULT = "/tmp/hls-5min-result.txt"


def fetch(url):
    with urllib.request.urlopen(url, timeout=20) as r:
        return r.status, r.read()


def main():
    start = time.time()
    seen = set()
    durations = []
    failures = []
    seg_ok = 0
    seg_fail = 0
    samples = 0
    print(
        f"Start HLS continuity {datetime.now(timezone.utc).isoformat()} "
        f"for {DURATION}s",
        flush=True,
    )

    while time.time() - start < DURATION:
        t0 = time.time()
        try:
            st, body = fetch(BASE + "/main_stream.m3u8")
            text = body.decode("utf-8", errors="replace")
            if st != 200:
                failures.append(("playlist", st, time.time() - start))
            else:
                samples += 1
                for m in re.finditer(r"#EXTINF:([0-9.]+),", text):
                    durations.append(float(m.group(1)))
                segs = re.findall(r"([^\s]+\.ts)", text)
                for s in segs[-2:]:
                    if s in seen:
                        continue
                    seen.add(s)
                    try:
                        sst, sbody = fetch(BASE + "/" + s)
                        if sst == 200 and len(sbody) > 1000:
                            seg_ok += 1
                        else:
                            seg_fail += 1
                            failures.append(
                                ("segment", sst, s, time.time() - start)
                            )
                    except Exception as e:
                        seg_fail += 1
                        failures.append(
                            ("segment_err", str(e), s, time.time() - start)
                        )
        except Exception as e:
            failures.append(("playlist_err", str(e), time.time() - start))

        elapsed = time.time() - start
        if int(elapsed) % 30 < INTERVAL:
            recent = durations[-5:] if durations else []
            print(
                f"[{elapsed:6.1f}s] samples={samples} segs_ok={seg_ok} "
                f"segs_fail={seg_fail} dur_recent={recent} fails={len(failures)}",
                flush=True,
            )
        sleep_for = INTERVAL - (time.time() - t0)
        if sleep_for > 0:
            time.sleep(sleep_for)

    ok = seg_fail == 0 and samples > 50 and bool(durations)
    lines = [
        f"PASS={ok}",
        f"samples={samples}",
        f"seg_ok={seg_ok}",
        f"seg_fail={seg_fail}",
        f"unique_segments={len(seen)}",
        f"dur_min={min(durations) if durations else None}",
        f"dur_med={statistics.median(durations) if durations else None}",
        f"dur_max={max(durations) if durations else None}",
        f"failures={failures[:20]}",
    ]
    Path = __import__("pathlib").Path
    Path(RESULT).write_text("\n".join(lines) + "\n")
    print("=== RESULT ===", flush=True)
    print("\n".join(lines), flush=True)
    print("PASS" if ok else "FAIL", flush=True)


if __name__ == "__main__":
    main()
