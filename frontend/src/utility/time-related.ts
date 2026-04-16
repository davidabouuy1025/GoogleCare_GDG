export function getMalaysiaTime() {
return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
}

export function getMalaysiaISOString() {
return getMalaysiaTime().toISOString();
}

export function getMalaysiaDateKey() {
return getMalaysiaTime().toISOString().split('T')[0];
}

export function getDeadlineDate(deadlineTime) {
const [hours, minutes] = deadlineTime.split(":").map(Number);

  const now = new Date(); // today

return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
    0
);
}