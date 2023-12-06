
function ErrorModal(props?: { message: string, timeout: number }) {
    const [visible, setVisibility] = useState(true)
    useEffect(() => {
        const timer = setTimeout(() => setVisibility(false), props.timeout)
        return () => clearTimeout(timer);
    }, [visible])
    return visible && <div id="errorContainer">
        <div id="error" className="danger">
            {props.message}
        </div>
    </div>
}