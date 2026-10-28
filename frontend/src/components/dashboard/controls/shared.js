export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });

export const validResume = (file) =>
  /\.(pdf|docx)$/i.test(file.name) &&
  file.size > 0 &&
  file.size <= 5 * 1024 * 1024;
