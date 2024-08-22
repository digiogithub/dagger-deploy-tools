# Node.js project builds with Dagger

This code need [Dagger Engine installed](https://docs.dagger.io/quickstart/cli/) and Docker

## Generating build files

Run in terminal, the code build will be exported to `./exported` folder

```
dagger call buildBackend --source=. export --path=./exported
```

Export build file as tgz

```
dagger call export-tgz --source=. export --path=./archive.tgz
```

## Example for deploying node backend

Please run this command in the same folder of source project

```
dagger -m github.com/digiogithub/dagger-deploy-tools/node call deploy-backend \
    --source=. --essh-config /path/esshconfig.lua \
    --aws-credentials /path/aws_credentials \
    --ssh-key /path/ssh_key \
    --hostname thehostname

```
