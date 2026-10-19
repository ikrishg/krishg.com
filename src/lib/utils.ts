export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
}) => date.toLocaleDateString("en-IN", options);
