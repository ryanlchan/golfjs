

function AppMenuItem(props: { href: string, icon: VNode, text: string }) {
    return <a href={props.href}><span className="menuIcon">{props.icon}</span>{props.text}</a>
}

function AppMenuNewLink() {
    const href = "new.html";
    const icon = <svg xmlns="http://www.w3.org/2000/svg" height="16" width="12" viewBox="0 0 384 512"><path d="M384 192c0 66.8-34.1 125.6-85.8 160H85.8C34.1 317.6 0 258.8 0 192C0 86 86 0 192 0S384 86 384 192zM242.1 256.6c0 18.5-15 33.5-33.5 33.5c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4zm-52.3-49.3c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4c0 18.5-15 33.5-33.5 33.5zm113.5-17.5c0 18.5-15 33.5-33.5 33.5c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4zM96 416c0-17.7 14.3-32 32-32h64 64c17.7 0 32 14.3 32 32s-14.3 32-32 32H240c-8.8 0-16 7.2-16 16v16c0 17.7-14.3 32-32 32s-32-14.3-32-32V464c0-8.8-7.2-16-16-16H128c-17.7 0-32-14.3-32-32z" /></svg>
    const text = "New round"
    return <AppMenuItem href={href} text={text} icon={icon} />
}

function AppMenuStatsLink() {
    const href = "stats.html";
    const icon = <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 512 512"><path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64V400c0 44.2 35.8 80 80 80H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H80c-8.8 0-16-7.2-16-16V64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z" /></svg>
    const text = "Stats"
    return <AppMenuItem href={href} text={text} icon={icon} />
}

function AppMenuSettingsLink() {
    const href = "settings.html";
    const icon = <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 512 512"><path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z" /></svg>
    const text = "Settings"
    return <AppMenuItem href={href} text={text} icon={icon} />
}

function AppMenu() {
    return <div className="appMenu">
        <AppMenuNewLink />
        <AppMenuStatsLink />
        <AppMenuSettingsLink />
    </div>
}

export function MenuButton() {
    const [menuVisible, setMenuVisible] = useState(false);

    const toggleMenu = () => {
        setMenuVisible(!menuVisible);
    };

    return (<div className="menuButton">
        <button id="menuButton" className="mapButton" onClick={toggleMenu}>
            <svg height="1.25em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 18L20 18" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 12L20 12" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 6L20 6" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
            </svg>
        </button>
        {menuVisible && <AppMenu />}
    </div>);
}