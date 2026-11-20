// Quick-Add NLP Parser for Live Chips & Smart Input (Priority & Lists)
export function parseQuickAdd(rawInput, lists = []) {
  if (!rawInput) {
    return { cleanTitle: '', priority: 0, priorityLabel: null, dueAt: null, dueLabel: null, listId: null, listName: null };
  }

  let text = rawInput;
  let priority = 0;
  let priorityLabel = null;
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

  let cleanTitle = text.replace(/\s+/g, ' ').trim();
  if (!cleanTitle) {
    if (priorityLabel) cleanTitle = `${priorityLabel} Priority Task`;
    else cleanTitle = rawInput.trim();
  }

  return {
    cleanTitle,
    priority,
    priorityLabel,
    dueAt: null,
    dueLabel: null,
    listId,
    listName
  };
}
