# Dashboard Ranking

Sistema local para gerenciar e exibir um ranking de grupos por turma.

## Funcionalidades

- Ranking publico com destaque para o TOP 3.
- Filtro por turma.
- Painel administrativo com login.
- Cadastro e exclusao de grupos.
- Alteracao de pontuacao com botoes `+100`, `+50`, `+10`, `-10`, `-50` e `-100`.
- Pontuacao minima travada em `0`.
- Bloqueio de grupos duplicados na mesma turma.
- Desempate mantendo na frente quem ja estava na frente antes.
- Acesso pelo celular na mesma rede do computador.

## Como Rodar

Instale as dependencias:

```powershell
npm install
```

Inicie o servidor:

```powershell
npm start
```

Abra no navegador:

```txt
http://localhost:3000
```

## Area Admin

Acesse diretamente pela URL:

```txt
http://localhost:3000/superadminana.html
```

Senha inicial quando `data/admin.txt` nao existe:

```txt
admin123
```

Depois de entrar, use a opcao **Alterar Senha**. A senha e salva com hash em `data/admin.txt`.

## Arquivos de Dados

O projeto nao usa mais SQLite. Os dados ficam em arquivos `.txt`:

```txt
data/admin.txt
data/ranking.txt
```

`data/admin.txt` guarda a senha do painel administrativo.

`data/ranking.txt` guarda grupos, turmas, pontuacao e ordem do ranking.

Esses arquivos ficam fora da pasta `public`, entao nao sao servidos como arquivos estaticos pelo navegador.

Tudo que for criado pelo computador ou pelo celular e salvo nesses arquivos locais, porque o celular acessa o servidor rodando no computador.

## Acesso Pelo Celular

Ao iniciar o servidor, o terminal mostra enderecos parecidos com:

```txt
Celular na mesma rede: http://10.0.0.40:3000
```

Abra esse endereco no navegador do celular. O celular precisa estar na mesma rede do computador.

Se nao abrir, verifique se o Firewall do Windows permitiu o Node.js na rede privada.

## Variaveis Opcionais

Voce pode mudar a porta:

```powershell
$env:PORT="3001"
npm start
```

Voce pode definir uma senha inicial quando `data/admin.txt` ainda nao existe:

```powershell
$env:ADMIN_INITIAL_PASSWORD="suaSenha"
npm start
```

Voce tambem pode definir o segredo da sessao:

```powershell
$env:SESSION_SECRET="um-segredo-local"
npm start
```

## Estrutura

```txt
data/
  admin.txt
  ranking.txt
public/
  index.html
  superadminana.html
  styles.css
server.js
package.json
```

## Observacoes

- O projeto foi pensado para uso local ou servidor simples com Node.js.
- `node_modules/` nao deve ser enviado para o GitHub.
- `server.log` nao deve ser enviado para o GitHub.
- `ranking.db` nao e mais usado.
- Para parar o servidor, pressione `Ctrl + C` no terminal onde o `npm start` esta rodando.
