import { Avatar } from '@/admin/ui'
import { Cell, Family, Item, SAMPLE_FAVICON, styles } from './ui'

export function DataDisplay() {
  return (
    <Family id="data-display" title="Data display">
      <Item id="avatar" title="Avatar" figma="332:340" note="blue = Kuartz, green = client. Image with initials fallback.">
        <div className={styles.row}>
          {([20, 28, 40] as const).map((size) =>
            (['blue', 'green', 'neutral'] as const).map((tone) => (
              <Cell key={`${size}-${tone}`} label={`${size} · ${tone}`}>
                <Avatar name={tone === 'green' ? 'Marie Client' : 'Andrea'} initials={tone === 'green' ? 'M' : 'A'} size={size} tone={tone} />
              </Cell>
            )),
          )}
          <Cell label="image">
            <Avatar name="Conduit" src={SAMPLE_FAVICON} size={40} />
          </Cell>
          <Cell label="broken image → initials">
            <Avatar name="Kuartz Studio" src="/does-not-exist.png" size={40} />
          </Cell>
        </div>
      </Item>
    </Family>
  )
}
