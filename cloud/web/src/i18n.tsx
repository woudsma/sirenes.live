import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'nl'

const STORAGE_KEY = 'lang'

export const LANGUAGES: { code: Lang; flag: string; label: string }[] = [
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'nl', flag: '🇳🇱', label: 'NL' },
]

type LanguageContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  toggle: () => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'nl') return stored
  return navigator.language?.toLowerCase().startsWith('nl') ? 'nl' : 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (next: Lang) => setLangState(next)
  const toggle = () => setLangState((prev) => (prev === 'en' ? 'nl' : 'en'))

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}

type InfoStrings = {
  why: {
    title: string
    body: string
    estIntro: string
    estTotalSirens: string
    estTotalTime: string
    estNightly: string
    hoursUnit: string
    estBasedOn: (days: number) => string
  }
  accuracy: { title: string; body: string }
  privacy: { title: string; body: string }
  howItWorks: {
    title: string
    p1a: string
    p1b: string
    p1c: string
    p1d: string
    p2a: string
    p2b: string
  }
  contact: { title: string; before: string; emailLabel: string; after: string }
}

export const infoText: Record<Lang, InfoStrings> = {
  en: {
    why: {
      title: 'Why?',
      body: 'I live near a hospital, so sirens are a constant. I wanted to quantify the madness: how many pass by, when, and how loud.',
      estIntro:
        'A very rough estimate of the all-time totals since I moved in, in early 2020:',
      estTotalSirens: 'Total sirens',
      estTotalTime: 'Total siren time',
      estNightly: 'All nightly sirens',
      hoursUnit: 'hours',
      estBasedOn: (days) => `Based on ${days} days of data`,
    },
    accuracy: {
      title: 'How accurate is this?',
      body: "Detection isn't 100% accurate. The on-device model typically misses a few sirens a day, and it only logs sirens that stay audible for at least 5 seconds, so brief or distant ones won't be counted. The recorded loudness isn't accurate either. It's an uncalibrated reading through a closed window, so treat it as a rough relative measure, not a real dB level.",
    },
    privacy: {
      title: 'Recording & privacy',
      body: "The device sits inside my own home, recording the sound in my room, not the street or my neighbours. It isn't recording around the clock; it just listens and processes the sound in real time, only saving a short five-second clip when a detection starts. I manually review every clip before it's made public, so nothing goes online until I've listened to it first.",
    },
    howItWorks: {
      title: 'How it works',
      p1a: 'An always-on ',
      p1b: ' microcontroller with a small ',
      p1c: ' runs a TinyML model (trained with ',
      p1d: ") that listens for emergency sirens. It works by breaking each fraction of a second of sound into its frequencies (a spectrogram) and recognising the characteristic alternating two-tone pattern (roughly 420 and 660 Hz) rather than any single pitch. Each detection's time and loudness is logged and sent to a self-hosted server, which stores the events and serves these graphs.",
      p2a: 'The full source code (firmware, web UI, and server) is on ',
      p2b: '.',
    },
    contact: {
      title: 'Contact',
      before: 'Questions? Send me an ',
      emailLabel: 'email',
      after: '.',
    },
  },
  nl: {
    why: {
      title: 'Waarom?',
      body: 'Ik woon naast een ziekenhuis, dus sirenes van hulpdiensten zijn er constant. Ik wilde de chaos in cijfers vangen: hoeveel er voorbijkomen, wanneer, en hoe hard.',
      estIntro:
        'Een hele ruwe schatting van de totalen sinds ik hier begin 2020 kwam wonen:',
      estTotalSirens: 'Totaal sirenes',
      estTotalTime: 'Totale sirenetijd',
      estNightly: 'Alle nachtelijke sirenes',
      hoursUnit: 'uur',
      estBasedOn: (days) => `Gebaseerd op ${days} dagen aan data`,
    },
    accuracy: {
      title: 'Hoe nauwkeurig is het?',
      body: 'Detectie is niet 100% nauwkeurig. Het model op het apparaat mist meestal een paar sirenes per dag, en het registreert alleen sirenes die minstens 5 seconden hoorbaar blijven, dus korte of verre sirenes worden niet meegeteld. De gemeten luidheid is ook niet nauwkeurig. Het is een ongekalibreerde meting door een gesloten raam, dus zie het als een ruwe relatieve maat, niet als een echt dB-niveau.',
    },
    privacy: {
      title: 'Opname & privacy',
      body: 'Het apparaat staat in mijn eigen huis en neemt het geluid in mijn kamer op, niet de straat of mijn buren. Het neemt niet de hele dag op; het luistert alleen en verwerkt het geluid in real time, en bewaart pas een kort fragment van vijf seconden wanneer er een detectie begint. Ik beluister elk fragment handmatig voordat het openbaar wordt gemaakt, dus er komt niets online voordat ik het zelf heb beluisterd.',
    },
    howItWorks: {
      title: 'Hoe het werkt',
      p1a: 'Een ',
      p1b: '-microcontroller met een kleine ',
      p1c: ' draait een TinyML-model (getraind met ',
      p1d: ') dat luistert naar hulpdienstsirenes. Het werkt door elke fractie van een seconde geluid op te splitsen in frequenties (een spectrogram) en het kenmerkende afwisselende tweetonige patroon (ongeveer 420 en 660 Hz) te herkennen in plaats van één enkele toon. Van elke detectie worden de tijd en luidheid geregistreerd en naar een zelf-gehoste server gestuurd, die de gebeurtenissen opslaat en deze grafieken toont.',
      p2a: 'De volledige broncode (firmware, web-UI en server) staat op ',
      p2b: '.',
    },
    contact: {
      title: 'Contact',
      before: 'Vragen? Stuur me een ',
      emailLabel: 'e-mail',
      after: '.',
    },
  },
}

// "12 sirens" / "12 sirenes", with correct singular form.
export function sirens(n: number, lang: Lang): string {
  if (lang === 'nl') return `${n} ${n === 1 ? 'sirene' : 'sirenes'}`
  return `${n} ${n === 1 ? 'siren' : 'sirens'}`
}

export const MONTHS_SHORT: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  nl: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
}

// Mon → Sun order (matches the chart axes).
export const DAY_SHORT: Record<Lang, string[]> = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  nl: ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'],
}

// 0 = Sunday … 6 = Saturday (matches the API's weekday index).
export const DAY_FULL: Record<Lang, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  nl: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'],
}

type DashboardStrings = {
  heading: string
  subtitle: string
  tabs: { dashboard: string; events: string; info: string }
  timeSinceLast: string
  kpi: {
    totalSirens: string
    today: string
    total: string
    totalInfo: string
    avgSirens: string
    perDay: string
    perWeek: string
    avgInfo: string
    totalTime: string
    totalTimeInfo: string
    aSirenEvery: string
    everyInfo: string
    busiestDay: string
    busiestDayInfo: string
    busiestHour: string
    busiestHourInfo: string
    longestQuiet: string
    longestQuietInfo: string
    avgNight: string
    nightUnit: string
    avgNightInfo: string
  }
  charts: {
    calendar: string
    calendarInfo: string
    less: string
    more: string
    peak: string
    heatmap: string
    heatmapInfo: string
    selectWeek: string
    lastSevenDays: string
    timeOfDay: string
    timeOfDayInfo: string
    perDay: string
    perDayInfo: string
    weekday: string
    weekdayInfo: string
    duration: string
    durationInfo: string
    cumulative: string
    cumulativeInfo: string
    temp: string
    tempInfo: string
    weather: string
    weatherInfo: string
    waitingWeather: string
    sirensPerDayUnit: (avg: string, days: number) => string
    buckets: { dry: string; lightRain: string; rain: string }
    series: { sirens: string; minutes: string; cumulative: string; sirensPerDay: string }
    axisTemp: string
    axisSirens: string
  }
  events: {
    downloadCsv: string
    detections: string
    toReview: string
    shown: string
    clearAll: string
    clearConfirm: string
    colTime: string
    colPeakDb: string
    colDuration: string
    colConfidence: string
    colClip: string
    noDetections: string
    playClip: string
    stopClip: string
    downloadClip: string
    downloadAsNoise: string
    clipPendingReview: string
    clipPrivate: string
    noClip: string
    deleteEvent: string
    manage: string
    managementUnlocked: string
    lock: string
    unlock: string
    adminToken: string
    incorrectToken: string
  }
}

export const dashboardText: Record<Lang, DashboardStrings> = {
  en: {
    heading: 'Siren Detector',
    subtitle: 'Listening from behind my window near OLVG West, Amsterdam',
    tabs: { dashboard: 'Dashboard', events: 'Events', info: 'Info' },
    timeSinceLast: 'Time since last siren:',
    kpi: {
      totalSirens: 'Total sirens',
      today: 'Today',
      total: 'Total',
      totalInfo: 'Number of sirens detected today and since the device started counting.',
      avgSirens: 'Average sirens',
      perDay: 'Per day',
      perWeek: 'Per week',
      avgInfo:
        'All-time siren count divided by the number of days with at least one detection, shown per day and as a per-week rate (× 7).',
      totalTime: 'Total siren time',
      totalTimeInfo: 'Combined duration of every detected siren — for today and all-time.',
      aSirenEvery: 'A siren every',
      everyInfo:
        'Average time between sirens in each window: the window length divided by the average number of sirens detected in it per active day. 07–23h is daytime, 09–17h is office hours.',
      busiestDay: 'Busiest day',
      busiestDayInfo: 'The single calendar day with the most detections, and how many there were.',
      busiestHour: 'Busiest hour',
      busiestHourInfo:
        'The single hour on a single day with the most detections — the date and the number of sirens in that one-hour window.',
      longestQuiet: 'Longest quiet streak',
      longestQuietInfo:
        'The longest stretch of daytime with no sirens — the biggest gap between two consecutive detections (counting only 07:00–23:00 and skipping the nights between), and the dates it spanned.',
      avgNight: 'Average sirens at night',
      nightUnit: '23:00–07:00 / day',
      avgNightInfo: 'Average number of sirens between 23:00 and 07:00 per active day.',
    },
    charts: {
      calendar: 'Detections over the last year',
      calendarInfo:
        "One cell per day for the past ~53 weeks; its shade reflects that day's detection count relative to the busiest day in range (darker = more).",
      less: 'Less',
      more: 'More',
      peak: 'peak',
      heatmap: 'When sirens happen (weekday × hour)',
      heatmapInfo:
        'One row per day for the last 7 days (today at the bottom; the window slides up as each new day begins). Each cell counts the sirens that started in that one-hour window on that day. Darker means more, scaled to the busiest cell shown.',
      selectWeek: 'Select week',
      lastSevenDays: 'Last 7 days',
      timeOfDay: 'Time of day',
      timeOfDayInfo:
        'Every detection is bucketed by the hour it started (00–23, local time) and summed across all days in range, so you can see which hours are busiest overall.',
      perDay: 'Sirens per day',
      perDayInfo:
        'One bar per calendar day; its height is the number of separate siren events detected that day (local time).',
      weekday: 'Sirens by weekday',
      weekdayInfo:
        "Each detection's start time is grouped by day of the week (Mon–Sun) and summed across every week in range — so a tall Monday bar means many sirens across all Mondays combined.",
      duration: 'Siren-time per day (min)',
      durationInfo:
        'Each bar sums the durations of every siren detected that day and converts the total to minutes. Covers the last 30 days.',
      cumulative: 'Cumulative detections',
      cumulativeInfo:
        "A running total: each day adds that day's detection count to the previous total, so the line only ever climbs. A steeper slope means a busier stretch.",
      temp: 'Sirens vs. temperature',
      tempInfo:
        "One dot per day: horizontal position is that day's mean temperature for Amsterdam (from Open-Meteo), vertical position is the number of sirens detected that day. A cloud that rises to the right means warmer days tend to have more sirens.",
      weather: 'Sirens vs. weather',
      weatherInfo:
        'Each day in range is bucketed by its total precipitation for Amsterdam (from Open-Meteo): Dry (< 1 mm), Light rain (1–5 mm), or Rain (≥ 5 mm). The bar shows the average number of sirens per day in each bucket, so you can compare wet days against dry ones even though there are many more dry days.',
      waitingWeather: 'Waiting for weather data…',
      sirensPerDayUnit: (avg, days) => `${avg} sirens/day · ${days} day${days === 1 ? '' : 's'}`,
      buckets: { dry: 'Dry', lightRain: 'Light rain', rain: 'Rain' },
      series: {
        sirens: 'Sirens',
        minutes: 'Minutes',
        cumulative: 'Cumulative',
        sirensPerDay: 'Sirens/day',
      },
      axisTemp: 'Temperature',
      axisSirens: 'Sirens',
    },
    events: {
      downloadCsv: 'Download CSV',
      detections: 'Detections',
      toReview: 'to review',
      shown: 'shown',
      clearAll: 'Clear all',
      clearConfirm: 'Delete all events and their clips? This cannot be undone.',
      colTime: 'Time',
      colPeakDb: 'Peak dB',
      colDuration: 'Duration',
      colConfidence: 'Confidence',
      colClip: 'Clip',
      noDetections: 'No detections yet.',
      playClip: 'Play clip',
      stopClip: 'Stop clip',
      downloadClip: 'Download clip',
      downloadAsNoise: 'Download as noise',
      clipPendingReview: 'clip pending review',
      clipPrivate: 'Clip is private until reviewed',
      noClip: 'no clip',
      deleteEvent: 'Delete event',
      manage: 'Manage',
      managementUnlocked: 'Management unlocked',
      lock: 'Lock',
      unlock: 'Unlock',
      adminToken: 'Admin token',
      incorrectToken: 'Incorrect admin token',
    },
  },
  nl: {
    heading: 'Sirene Detector',
    subtitle: 'Luistert achter mijn raam vlak bij OLVG West, Amsterdam',
    tabs: { dashboard: 'Dashboard', events: 'Events', info: 'Info' },
    timeSinceLast: 'Tijd sinds laatste:',
    kpi: {
      totalSirens: 'Sirenes totaal',
      today: 'Vandaag',
      total: 'Totaal',
      totalInfo:
        'Aantal sirenes dat vandaag is gedetecteerd en sinds het apparaat begon te tellen.',
      avgSirens: 'Sirenes gemiddeld',
      perDay: 'Per dag',
      perWeek: 'Per week',
      avgInfo:
        'Het totale aantal sirenes gedeeld door het aantal dagen met minstens één detectie, getoond per dag en als weektempo (× 7).',
      totalTime: 'Totale sirenetijd',
      totalTimeInfo:
        'De gecombineerde duur van elke gedetecteerde sirene — voor vandaag en aller tijden.',
      aSirenEvery: 'Een sirene elke',
      everyInfo:
        'Gemiddelde tijd tussen sirenes per venster: de lengte van het venster gedeeld door het gemiddelde aantal sirenes dat erin valt per actieve dag. 07–23u is overdag, 09–17u zijn kantooruren.',
      busiestDay: 'Drukste dag',
      busiestDayInfo: 'De enkele kalenderdag met de meeste detecties, en hoeveel het er waren.',
      busiestHour: 'Drukste uur',
      busiestHourInfo:
        'Het enkele uur op één dag met de meeste detecties — de datum en het aantal sirenes in dat ene uur.',
      longestQuiet: 'Langste stille periode',
      longestQuietInfo:
        'De langste periode overdag zonder sirenes — het grootste gat tussen twee opeenvolgende detecties (alleen 07:00–23:00, de nachten ertussen overgeslagen), en de data die het besloeg.',
      avgNight: "Sirenes gemiddeld 's nachts",
      nightUnit: '23:00–07:00 / dag',
      avgNightInfo: 'Gemiddeld aantal sirenes tussen 23:00 en 07:00 per actieve dag.',
    },
    charts: {
      calendar: 'Detecties van het afgelopen jaar',
      calendarInfo:
        'Eén vakje per dag voor de afgelopen ~53 weken; de tint geeft het aantal detecties van die dag weer ten opzichte van de drukste dag in het bereik (donkerder = meer).',
      less: 'Minder',
      more: 'Meer',
      peak: 'piek',
      heatmap: 'Sirenes (weekdag × uur)',
      heatmapInfo:
        'Eén rij per dag voor de afgelopen 7 dagen (vandaag onderaan; het venster schuift omhoog bij elke nieuwe dag). Elk vakje telt de sirenes die in dat ene uur op die dag begonnen. Donkerder betekent meer, geschaald op het drukste getoonde vakje.',
      selectWeek: 'Selecteer week',
      lastSevenDays: 'Afgelopen 7 dagen',
      timeOfDay: 'Tijd van de dag',
      timeOfDayInfo:
        'Elke detectie wordt ingedeeld op het uur waarin ze begon (00–23, lokale tijd) en opgeteld over alle dagen in het bereik, zodat je ziet welke uren over het algemeen het drukst zijn.',
      perDay: 'Sirenes per dag',
      perDayInfo:
        'Eén balk per kalenderdag; de hoogte is het aantal afzonderlijke sirenegebeurtenissen dat die dag is gedetecteerd (lokale tijd).',
      weekday: 'Sirenes per weekdag',
      weekdayInfo:
        'De begintijd van elke detectie wordt gegroepeerd per dag van de week (ma–zo) en opgeteld over elke week in het bereik — een hoge maandagbalk betekent dus veel sirenes over alle maandagen samen.',
      duration: 'Sirenetijd per dag (min)',
      durationInfo:
        'Elke balk telt de duur van alle sirenes van die dag op en zet het totaal om in minuten. Beslaat de laatste 30 dagen.',
      cumulative: 'Cumulatieve detecties',
      cumulativeInfo:
        'Een lopend totaal: elke dag telt het aantal detecties van die dag op bij het vorige totaal, dus de lijn stijgt alleen maar. Een steilere helling betekent een drukkere periode.',
      temp: 'Sirenes vs. temperatuur',
      tempInfo:
        'Eén stip per dag: de horizontale positie is de gemiddelde temperatuur van die dag voor Amsterdam (van Open-Meteo), de verticale positie is het aantal sirenes dat die dag is gedetecteerd. Een wolk die naar rechts oploopt betekent dat warmere dagen meestal meer sirenes hebben.',
      weather: 'Sirenes vs. regen',
      weatherInfo:
        'Elke dag in het bereik wordt ingedeeld op de totale neerslag voor Amsterdam (van Open-Meteo): Droog (< 1 mm), Lichte regen (1–5 mm), of Regen (≥ 5 mm). De balk toont het gemiddelde aantal sirenes per dag in elke groep, zodat je natte dagen kunt vergelijken met droge, ook al zijn er veel meer droge dagen.',
      waitingWeather: 'Wachten op weergegevens…',
      sirensPerDayUnit: (avg, days) => `${avg} sirenes/dag · ${days} dag${days === 1 ? '' : 'en'}`,
      buckets: { dry: 'Droog', lightRain: 'Lichte regen', rain: 'Regen' },
      series: {
        sirens: 'Sirenes',
        minutes: 'Minuten',
        cumulative: 'Cumulatief',
        sirensPerDay: 'Sirenes/dag',
      },
      axisTemp: 'Temperatuur',
      axisSirens: 'Sirenes',
    },
    events: {
      downloadCsv: 'Download CSV',
      detections: 'Detecties',
      toReview: 'te beoordelen',
      shown: 'getoond',
      clearAll: 'Alles wissen',
      clearConfirm:
        'Alle gebeurtenissen en hun fragmenten verwijderen? Dit kan niet ongedaan worden gemaakt.',
      colTime: 'Tijd',
      colPeakDb: 'Piek dB',
      colDuration: 'Duur',
      colConfidence: 'Zekerheid',
      colClip: 'Fragment',
      noDetections: 'Nog geen detecties.',
      playClip: 'Fragment afspelen',
      stopClip: 'Fragment stoppen',
      downloadClip: 'Fragment downloaden',
      downloadAsNoise: 'Downloaden als ruis',
      clipPendingReview: 'fragment wacht op beoordeling',
      clipPrivate: 'Fragment is privé tot het is beoordeeld',
      noClip: 'geen fragment',
      deleteEvent: 'Gebeurtenis verwijderen',
      manage: 'Beheren',
      managementUnlocked: 'Beheer ontgrendeld',
      lock: 'Vergrendelen',
      unlock: 'Ontgrendelen',
      adminToken: 'Admin-token',
      incorrectToken: 'Onjuist admin-token',
    },
  },
}
