// Quick-Add NLP Parser for Live Chips & Smart Input
// Robust parsing for: !high, !med, !low, !urgent, #lists, dates, and times

export function parseQuickAdd(rawInput, lists = []) {
  if (!rawInput) {
    return { cleanTitle: '', priority: 0, priorityLabel: null, dueAt: null, dueLabel: null, listId: null, listName: null };
  }

  let text = rawInput;
  let priority = 0;
  let priorityLabel = null;
  let dueAt = null;
  let dueLabel = null;
  let listId = null;
  let listName = null;

  // 1. Priority Tags: !urgent, !high, !med, !medium, !low
  const urgentMatch = text.match(/(?:^|\s)!(urgent|high)(?=\s|$|[.,!?])/i);
  if (urgentMatch) {
    priority = 3;
    priorityLabel = 'High';
    text = text.replace(urgentMatch[0], ' ');
  } else {
    const medMatch = text.match(/(?:^|\s)!(med|medium)(?=\s|$|[.,!?])/i);
    if (medMatch) {
      priority = 2;
      priorityLabel = 'Medium';
      text = text.replace(medMatch[0], ' ');
    } else {
      const lowMatch = text.match(/(?:^|\s)!low(?=\s|$|[.,!?])/i);
      if (lowMatch) {
        priority = 1;
        priorityLabel = 'Low';
        text = text.replace(lowMatch[0], ' ');
      }
    }
  }

  // 2. List Tags: #work, #study, #personal, etc.
  const listTagMatch = text.match(/(?:^|\s)#([\w-]+)(?=\s|$|[.,!?])/i);
  if (listTagMatch) {
    const tag = listTagMatch[1].toLowerCase();
    const foundList = lists.find(l => l.name.toLowerCase() === tag);
    if (foundList) {
      listId = foundList.id;
      listName = foundList.name;
    } else {
      listName = listTagMatch[1].charAt(0).toUpperCase() + listTagMatch[1].slice(1);
    }
    text = text.replace(listTagMatch[0], ' ');
  }

  // 3. Date Keywords (today, tomorrow, weekdays)
  const today = new Date();
  let targetDate = null;
  let dayLabel = null;

  if (/(?:^|\s)\btoday\b(?=\s|$|[.,!?])/i.test(text)) {
    targetDate = new Date();
    dayLabel = 'Today';
    text = text.replace(/(?:^|\s)\btoday\b(?=\s|$|[.,!?])/i, ' ');
  } else if (/(?:^|\s)\btomorrow\b(?=\s|$|[.,!?])/i.test(text)) {
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 1);
    dayLabel = 'Tomorrow';
    text = text.replace(/(?:^|\s)\btomorrow\b(?=\s|$|[.,!?])/i, ' ');
  } else {
    const weekdayMap = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6
    };
    const dayMatch = text.match(/(?:^|\s)\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b(?=\s|$|[.,!?])/i);
    if (dayMatch) {
      const targetDay = weekdayMap[dayMatch[1].toLowerCase()];
      const currentDay = today.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      targetDate = new Date();
      targetDate.setDate(today.getDate() + diff);
      dayLabel = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1);
      text = text.replace(dayMatch[0], ' ');
    }
  }

  // 4. Time Expressions (e.g. 5pm, 10:30am, at 5, 17:00, or bare numbers like "10" when date is set)
  let targetHour = null;
  let targetMinute = 0;

  const timeAmPm = text.match(/(?:^|\s)(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (timeAmPm) {
    let h = parseInt(timeAmPm[1], 10);
    const m = timeAmPm[2] ? parseInt(timeAmPm[2], 10) : 0;
    const mer = timeAmPm[3].toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    targetHour = h;
    targetMinute = m;
    text = text.replace(timeAmPm[0], ' ');
  } else {
    const time24 = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$|[.,!?])/);
    if (time24) {
      targetHour = parseInt(time24[1], 10);
      targetMinute = parseInt(time24[2], 10);
      text = text.replace(time24[0], ' ');
    } else if (targetDate) {
      const bareNumber = text.match(/(?:^|\s)(?:at\s+)?(\d{1,2})(?=\s|$|[.,!?])/i);
      if (bareNumber) {
        let h = parseInt(bareNumber[1], 10);
        if (h >= 1 && h <= 12) {
          if (h <= 6) h += 12; // 1-6 assume PM, 7-12 assume AM
          targetHour = h;
          text = text.replace(bareNumber[0], ' ');
        }
      }
    }
  }

  if (targetDate || targetHour !== null) {
    const d = targetDate || new Date();
    if (targetHour !== null) {
      d.setHours(targetHour, targetMinute, 0, 0);
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      dueLabel = dayLabel ? `${dayLabel}, ${timeStr}` : `Today, ${timeStr}`;
    } else {
      d.setHours(18, 0, 0, 0);
      dueLabel = dayLabel ? `${dayLabel}, 6:00 PM` : 'Today, 6:00 PM';
    }
    dueAt = d.toISOString();
  }

  let cleanTitle = text.replace(/\s+/g, ' ').trim();
  // If user only typed date/priority/list tokens with no title, provide a friendly default title
  if (!cleanTitle) {
    if (dueLabel) cleanTitle = `Task (${dueLabel})`;
    else if (priorityLabel) cleanTitle = `${priorityLabel} Priority Task`;
    else cleanTitle = rawInput.trim();
  }

  return {
    cleanTitle,
    priority,
    priorityLabel,
    dueAt,
    dueLabel,
    listId,
    listName,
  };
}
