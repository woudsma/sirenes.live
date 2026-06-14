#include "events.h"
#include "clips.h"
#include "config.h"
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

// Append-only CSV log on LittleFS: "epoch,duration_s,peak_db,confidence" per line.
// A mutex guards all filesystem + counter access (the audio task writes from
// core 0 while the async web server reads from core 1).

static SemaphoreHandle_t g_lock = nullptr;
static uint32_t g_total    = 0;
static uint32_t g_today    = 0;
static int      g_today_key = -1; // yyyymmdd the g_today counter refers to

// Ensure the log file exists so read-opens never trip LittleFS's error-level
// "no such file" log (the stats/events endpoints open it for read on every
// poll). Caller holds g_lock. Cheap no-op once the file is present.
static void ensure_log_exists() {
    if (LittleFS.exists(EVENTS_PATH)) return;
    File f = LittleFS.open(EVENTS_PATH, "w");
    if (f) f.close();
}

static int day_key(time_t t) {
    struct tm tm;
    localtime_r(&t, &tm);
    return (tm.tm_year + 1900) * 10000 + (tm.tm_mon + 1) * 100 + tm.tm_mday;
}

static bool parse_line(const String& line, SirenEvent& e) {
    long   epoch = 0;
    int    dur   = 0;
    float  db = 0, conf = 0;
    e.clip[0] = '\0';
    int n = sscanf(line.c_str(), "%ld,%d,%f,%f,%23[^\n]", &epoch, &dur, &db, &conf, e.clip);
    if (n < 4) return false; // 4 = legacy rows without a clip column
    e.epoch = (time_t)epoch;
    e.duration_s = (uint16_t)dur;
    e.peak_db = db;
    e.confidence = conf;
    return true;
}

// Recompute total + today by scanning the log. Caller holds g_lock.
static void rescan_locked() {
    g_total = 0;
    g_today = 0;
    g_today_key = day_key(time(nullptr));
    File f = LittleFS.open(EVENTS_PATH, "r");
    if (!f) return;
    while (f.available()) {
        String line = f.readStringUntil('\n');
        line.trim();
        if (line.isEmpty()) continue;
        SirenEvent e;
        if (!parse_line(line, e)) continue;
        g_total++;
        if (day_key(e.epoch) == g_today_key) g_today++;
    }
    f.close();
}

void events_init() {
    g_lock = xSemaphoreCreateMutex();
    xSemaphoreTake(g_lock, portMAX_DELAY);
    ensure_log_exists();
    rescan_locked();
    xSemaphoreGive(g_lock);
    Serial.printf("Event log: %lu events total\n", (unsigned long)g_total);
}

bool events_add(const SirenEvent& e) {
    xSemaphoreTake(g_lock, portMAX_DELAY);
    File f = LittleFS.open(EVENTS_PATH, "a");
    bool ok = false;
    if (f) {
        f.printf("%ld,%u,%.1f,%.3f,%s\n", (long)e.epoch, e.duration_s, e.peak_db, e.confidence, e.clip);
        f.close();
        g_total++;
        int today = day_key(time(nullptr));
        if (g_today_key != today) { g_today_key = today; g_today = 0; }
        if (day_key(e.epoch) == today) g_today++;
        ok = true;
    }
    xSemaphoreGive(g_lock);
    if (ok)
        Serial.printf("Event logged: %.1f dB, %us, conf %.2f\n", e.peak_db, e.duration_s, e.confidence);
    return ok;
}

bool events_delete(time_t epoch) {
    xSemaphoreTake(g_lock, portMAX_DELAY);
    bool removed = false;
    File in = LittleFS.open(EVENTS_PATH, "r");
    if (in) {
        const char* TMP = "/events.tmp";
        File out = LittleFS.open(TMP, "w");
        if (out) {
            while (in.available()) {
                String line = in.readStringUntil('\n');
                String trimmed = line; trimmed.trim();
                if (trimmed.isEmpty()) continue;
                SirenEvent e;
                if (parse_line(trimmed, e) && e.epoch == epoch) {
                    if (e.clip[0]) clips_remove(e.clip); // drop the linked audio too
                    removed = true;
                    continue; // skip (delete) this row
                }
                out.print(trimmed);
                out.print('\n');
            }
            out.close();
            in.close();
            if (removed) {
                LittleFS.remove(EVENTS_PATH);
                LittleFS.rename(TMP, EVENTS_PATH);
            } else {
                LittleFS.remove(TMP); // nothing changed; discard the copy
            }
        } else {
            in.close();
        }
    }
    if (removed) rescan_locked();
    xSemaphoreGive(g_lock);
    return removed;
}

void events_clear() {
    xSemaphoreTake(g_lock, portMAX_DELAY);
    LittleFS.remove(EVENTS_PATH);
    ensure_log_exists(); // recreate empty so later read-opens stay quiet
    clips_clear();
    g_total = 0;
    g_today = 0;
    g_today_key = day_key(time(nullptr));
    xSemaphoreGive(g_lock);
}

uint32_t events_total() {
    return g_total;
}

uint32_t events_count_today() {
    xSemaphoreTake(g_lock, portMAX_DELAY);
    if (day_key(time(nullptr)) != g_today_key) rescan_locked();
    uint32_t v = g_today;
    xSemaphoreGive(g_lock);
    return v;
}

String events_json(uint32_t limit, uint32_t offset) {
    if (limit > 200) limit = 200;
    static SirenEvent page[200];
    uint32_t count = 0;

    xSemaphoreTake(g_lock, portMAX_DELAY);
    uint32_t total = g_total;
    uint32_t start = (total > offset + limit) ? total - offset - limit : 0;
    uint32_t end   = (total > offset) ? total - offset : 0; // exclusive
    uint32_t idx   = 0;
    File f = LittleFS.open(EVENTS_PATH, "r");
    if (f) {
        while (f.available() && count < limit) {
            String line = f.readStringUntil('\n');
            line.trim();
            if (line.isEmpty()) continue;
            if (idx >= start && idx < end) {
                if (parse_line(line, page[count])) count++;
            }
            idx++;
        }
        f.close();
    }
    xSemaphoreGive(g_lock);

    JsonDocument doc;
    doc["total"] = total;
    JsonArray arr = doc["events"].to<JsonArray>();

    // Build the set of clips that still exist with ONE directory scan, instead of
    // a per-event LittleFS.exists(). exists() opens the file, and on the ESP32 a
    // failed open error-logs ("...does not exist, no permits for creation") for
    // every clip that was already uploaded + deleted — 11 such logs per poll here,
    // plus the churn of opening/closing each. Listing the dir once is quiet and
    // far cheaper. The clips budget keeps only ~2 files, so `present` stays tiny.
    String present = ",";
    {
        File dir = LittleFS.open(CLIPS_DIR);
        if (dir && dir.isDirectory())
            for (File cf = dir.openNextFile(); cf; cf = dir.openNextFile()) {
                const char* slash = strrchr(cf.name(), '/');
                present += slash ? slash + 1 : cf.name();
                present += ',';
            }
    }

    // newest first
    for (int i = (int)count - 1; i >= 0; i--) {
        JsonObject o = arr.add<JsonObject>();
        o["ts"]         = (long)page[i].epoch;
        o["durationS"]  = page[i].duration_s;
        o["peakDb"]     = page[i].peak_db;
        o["confidence"] = page[i].confidence;
        // Only advertise a clip if its file is still present (FIFO rotation /
        // cloud upload may have removed it). Membership check against the scan.
        if (page[i].clip[0] &&
            present.indexOf(String(",") + page[i].clip + ",") >= 0) {
            o["clip"] = String("/api/clip?f=") + page[i].clip;
        }
    }
    String out;
    serializeJson(doc, out);
    return out;
}

String events_stats_json() {
    const time_t now = time(nullptr);
    const int    today_key = day_key(now);
    const time_t window_start = now - 31L * 86400L; // perDay = last ~31 days

    uint32_t total = 0, today = 0;
    uint32_t perHour[24] = {0};
    // dB histogram: <70, 70-80, 80-90, 90-100, >=100
    uint32_t dbHist[5] = {0};
    // recent-days buckets
    const int MAXD = 40;
    int   dayKeys[MAXD];
    uint32_t dayCount[MAXD];
    float dayPeak[MAXD];
    int   nDays = 0;

    xSemaphoreTake(g_lock, portMAX_DELAY);
    File f = LittleFS.open(EVENTS_PATH, "r");
    if (f) {
        while (f.available()) {
            String line = f.readStringUntil('\n');
            line.trim();
            if (line.isEmpty()) continue;
            SirenEvent e;
            if (!parse_line(line, e)) continue;
            total++;

            struct tm tm;
            localtime_r(&e.epoch, &tm);
            perHour[tm.tm_hour % 24]++;

            int dk = (tm.tm_year + 1900) * 10000 + (tm.tm_mon + 1) * 100 + tm.tm_mday;
            if (dk == today_key) today++;

            int b = e.peak_db < 70 ? 0 : e.peak_db < 80 ? 1 : e.peak_db < 90 ? 2 : e.peak_db < 100 ? 3 : 4;
            dbHist[b]++;

            if (e.epoch >= window_start) {
                int found = -1;
                for (int i = 0; i < nDays; i++) if (dayKeys[i] == dk) { found = i; break; }
                if (found < 0 && nDays < MAXD) { found = nDays++; dayKeys[found] = dk; dayCount[found] = 0; dayPeak[found] = 0; }
                if (found >= 0) {
                    dayCount[found]++;
                    if (e.peak_db > dayPeak[found]) dayPeak[found] = e.peak_db;
                }
            }
        }
        f.close();
    }
    xSemaphoreGive(g_lock);

    // sort day buckets ascending by key (simple insertion sort, small n)
    for (int i = 1; i < nDays; i++) {
        int k = dayKeys[i]; uint32_t c = dayCount[i]; float p = dayPeak[i];
        int j = i - 1;
        while (j >= 0 && dayKeys[j] > k) { dayKeys[j+1]=dayKeys[j]; dayCount[j+1]=dayCount[j]; dayPeak[j+1]=dayPeak[j]; j--; }
        dayKeys[j+1]=k; dayCount[j+1]=c; dayPeak[j+1]=p;
    }

    JsonDocument doc;
    doc["today"] = today;
    doc["total"] = total;

    JsonArray pd = doc["perDay"].to<JsonArray>();
    int startDay = nDays > 30 ? nDays - 30 : 0; // last 30 days
    for (int i = startDay; i < nDays; i++) {
        JsonObject o = pd.add<JsonObject>();
        char date[12];
        snprintf(date, sizeof(date), "%04d-%02d-%02d", dayKeys[i]/10000, (dayKeys[i]/100)%100, dayKeys[i]%100);
        o["date"]   = date;
        o["count"]  = dayCount[i];
        o["peakDb"] = dayPeak[i];
    }

    JsonArray ph = doc["perHour"].to<JsonArray>();
    for (int h = 0; h < 24; h++) ph.add(perHour[h]);

    JsonArray dh = doc["dbHistogram"].to<JsonArray>();
    const char* labels[5] = {"<70", "70-80", "80-90", "90-100", ">=100"};
    for (int i = 0; i < 5; i++) {
        JsonObject o = dh.add<JsonObject>();
        o["bin"]   = labels[i];
        o["count"] = dbHist[i];
    }

    String out;
    serializeJson(doc, out);
    return out;
}

const char* events_csv_path() {
    return EVENTS_PATH;
}
