// utils/badges.js
// Tính danh hiệu (badge/title) dựa trên level & thống kê

export function getTitles(user, level) {
  const titles = [];

  // theo level
  if (level >= 100) titles.push('Huyền thoại');
  else if (level >= 50) titles.push('Kỳ cựu');
  else if (level >= 20) titles.push('Chăm chỉ');
  else if (level >= 10) titles.push('Tập sự');

  // theo streak
  if ((user.dailyStreak || 0) >= 7) {
    titles.push('Chuỗi 7 ngày');
  }

  // theo chat
  if ((user.messageCount || 0) >= 1000) {
    titles.push('Máy cày chat');
  }

  // theo tuần / tháng
  if ((user.weekXP || 0) >= 1000) {
    titles.push('Best tuần');
  }
  if ((user.monthXP || 0) >= 3000) {
    titles.push('Đại gia tháng');
  }

  if (!titles.length) titles.push('Thành viên');

  return titles;
}
