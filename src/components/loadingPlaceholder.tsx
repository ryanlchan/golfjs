export function LoadingPlaceholder({ title, percent }: { title?: string, percent?: number }) {
    title = title || "Loading...";

    return <div className="loading">
        <h3>{title}</h3>
        {percent ? <progress max="100" value={percent}></progress> : <progress />}
    </div>
}