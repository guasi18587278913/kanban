export function JsonPreview({
  value,
  placeholder,
  metadata,
  className,
}: {
  value: string;
  placeholder?: string;
  metadata?: Record<string, any>;
  className?: string;
}) {
  console.log('xxx', value, typeof value);
  if (!value) {
    if (placeholder) {
      return <div className={className}>{placeholder}</div>;
    }

    return null;
  }

  if (typeof value !== 'string') {
    return <div className={className}>{value}</div>;
  }

  let formatted: string | null = null;
  try {
    const json = JSON.parse(value);
    formatted = JSON.stringify(json, null, 2);
  } catch (error) {
    formatted = null;
  }

  if (formatted) {
    return <pre className={className}>{formatted}</pre>;
  }

  return <div className={className}>{value}</div>;
}
