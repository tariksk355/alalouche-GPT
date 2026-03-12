export function StorefrontNotice({ type = 'info', children, className = '' }) {
  const styles = {
    info: 'bg-gray-50 border-gray-200 text-gray-700',
    success: 'bg-green-50 border-green-200 text-green-700',
    error: 'bg-red-50 border-red-200 text-red-700',
  };

  return (
    <div className={`border rounded-md px-3 py-2 text-sm ${styles[type] || styles.info} ${className}`}>
      {children}
    </div>
  );
}

export function StorefrontLoadingState({ label = 'Chargement...' }) {
  return <div className="text-center py-12 text-gray-400">{label}</div>;
}

export function StorefrontEmptyState({ title, description, action = null, className = '' }) {
  return (
    <div className={`text-center py-12 text-gray-500 border border-dashed border-gray-200 rounded-xl ${className}`}>
      <p className="text-lg mb-2 text-gray-700">{title}</p>
      {description && <p className="text-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}
