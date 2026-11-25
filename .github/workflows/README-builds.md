# Getting builds into the shop

The checkout serves a build only to a request carrying a valid, unexpired,
unused-up token. For that to work the file has to be in the private R2 bucket
under the key the item names in its `file` field in `items.json`.

Nothing automated does this yet, on purpose: the builds are produced in
`lucidsoup/Vst-Library` and this repository is a different one, so wiring the
two together means giving one of them a credential for the other, and that is
a decision rather than a default.

By hand, once a build is ready:

```sh
wrangler r2 object put lucidsoup-builds/mindbloom.zip --file ./Mindbloom-Windows.zip
```

To do it from Vst-Library's own release workflow instead, add a step that runs
after the release is published, with `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` set as repository secrets:

```yaml
- name: Publish the build to the shop
  run: |
    npx wrangler r2 object put lucidsoup-builds/${{ env.PLUGIN_ID }}.zip \
      --file dist/${{ env.PLUGIN_ID }}-Windows.zip
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Use an API token scoped to **Workers R2 Storage: Edit on that one bucket** and
nothing else. A token that can do more than write one bucket is a token that
can do more than it needs to from a workflow anyone with push access can edit.
