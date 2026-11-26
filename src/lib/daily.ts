import type { AppData } from './types';
import { localDay } from './day';

/**
 * Whether the whole window should wear the red alarm border.
 *
 * This used to light up whenever *any* daily was still open, which meant it was
 * on from midnight until the day was cleared — an alarm that is almost always
 * ringing is not information, it is just pressure. It is now opt-in, and stays
 * dark unless the operator asks for it in [CFG].
 */
export function hasMissingDailyActivities(data: AppData): boolean {
  if (!data.settings.alarmBorder) return false;

  const hasOpenDailyQuest = data.quests.some(
    (quest) => (quest.cadence === 'Today' || quest.cadence === 'Daily') && !quest.completed
  );
  const hasOpenBaseDaily = data.abode.tasks.some(
    (task) => task.cadence === 'Daily' && !task.completed
  );
  const hasOpenPetDaily = data.pet.tasks.some(
    (task) => task.cadence === 'Daily' && !task.completed
  );
  const today = localDay();
  const needsSignalCheck = data.signal.today.date !== today || !data.signal.today.checkedIn;

  return hasOpenDailyQuest || hasOpenBaseDaily || hasOpenPetDaily || needsSignalCheck;
}

/**
 * A plain, countable list of what is still open today — shown in the gaps strip.
 * Deliberately descriptive ("3 daily quests open"), never evaluative. Body
 * upkeep only appears when the operator has body tracking switched fully on.
 */
export function missingDailySummary(data: AppData): string[] {
  if (data.settings.showDailyGaps === false) return [];

  const out: string[] = [];
  const today = localDay();

  const openQuests = data.quests.filter(
    (quest) => (quest.cadence === 'Today' || quest.cadence === 'Daily') && !quest.completed
  ).length;
  if (openQuests) out.push(`${openQuests} daily quest${openQuests > 1 ? 's' : ''} open`);

  const baseDaily = data.abode.tasks.filter((t) => t.cadence === 'Daily' && !t.completed).length;
  if (baseDaily) out.push(`${baseDaily} base task${baseDaily > 1 ? 's' : ''}`);

  const petDaily = data.pet.tasks.filter((t) => t.cadence === 'Daily' && !t.completed).length;
  if (petDaily) out.push(`${petDaily} pet task${petDaily > 1 ? 's' : ''}`);

  if (data.signal.today.date !== today || !data.signal.today.checkedIn) out.push('signal not sealed');
  if ((data.settings.bodyTracking ?? 'quiet') === 'on' && data.vessel.today.water === 0) {
    out.push('no water logged');
  }

  return out;
}
