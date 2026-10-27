import styles from '@components/browser.module.scss';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import cancelEvent from '@helpers/dom/cancelEvent';
import clamp from '@helpers/number/clamp';
import classNames from '@helpers/string/classNames';
import {useAppSettings} from '@stores/appSettings';

const SCALE_STEP = 0.1;

/**
 * "A 100% A" in an in-app browser page's menu: the size of what is read there (Instant View, a book),
 * one setting for all of them (appSettings.instantView.scale). Made inside the page's reactive root.
 */
export default function readingScaleMenuButton(): ButtonMenuItemOptionsVerifiable {
  const [appSettings, setAppSettings] = useAppSettings();
  const changeScale = (add: boolean, e: MouseEvent) => {
    cancelEvent(e);
    setAppSettings(
      'instantView',
      'scale',
      (value) => clamp(+(value + (add ? SCALE_STEP : -SCALE_STEP)).toFixed(2), 0.5, 1.5)
    );
    return false;
  };

  return {
    element: (
      <span class={classNames('btn-menu-item', styles.ScaleMenu)}>
        <span class={classNames(styles.ScaleMenuSmaller, 'hover-effect')} onClick={changeScale.bind(null, false)}>A</span>
        <span class={styles.ScaleMenuScale}>{Math.round(appSettings.instantView.scale * 100) + '%'}</span>
        <span class={classNames(styles.ScaleMenuBigger, 'hover-effect')} onClick={changeScale.bind(null, true)}>A</span>
      </span>
    ) as HTMLElement,
    onClick: () => {}
  };
}
