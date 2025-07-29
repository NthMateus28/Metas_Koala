const idsValidos = [
  15102988390, 15104227133, 15104022626, 15102988260, 15103180033,
  15103323507, 15106965891, 14316562699, 15101996841, 15103135847,
  15102988191, 15104300347, 15102642266, 14316243535, 15102242030,
  14316243464, 15103136599, 15101873294, 15107363711, 15103131838,
  15105999702, 15105613261
];

const metaGeral = 2500000;
const metaArmer = 937500;
const hoje = new Date();
const mesAtual = hoje.getMonth();
const anoAtual = hoje.getFullYear();
const ultimoDiaDoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();

async function buscarNotas() {
  try {
    const detalhesCacheados = await fetch('http://localhost:3000/api/nfe-cache')
      .then(res => res.json())
      .catch(() => ({}));

    const detalhes = Object.values(detalhesCacheados || {});

    const notasFiltradas = detalhes.filter(nf => {
      const data = nf?.data?.dataEmissao;
      const natureza = nf?.data?.naturezaOperacao?.id;
      if (!data || !natureza) return false;

      const dataEmissao = new Date(data);
      return (
        dataEmissao.getFullYear() === anoAtual &&
        dataEmissao.getMonth() === mesAtual &&
        idsValidos.includes(natureza)
      );
    });

    const realizado = notasFiltradas.reduce((soma, nf) => soma + (nf?.data?.valorNota || 0), 0);
    const proporcao = hoje.getDate() / ultimoDiaDoMes;
    const projetado = realizado / proporcao;

    renderizarGrafico(realizado, projetado);
    renderizarGraficoArmer(notasFiltradas);
    gerarTopProdutos(notasFiltradas);
  } catch (err) {
    console.error('Erro ao processar notas:', err);
  }
}

Chart.register({
  id: 'centerText',
  beforeDraw(chart) {
    const { width, height } = chart;
    const ctx = chart.ctx;
    const pluginOpts = chart.config.options.plugins.centerText;
    if (!pluginOpts) return;

    const { realizado, projetado, meta, label } = pluginOpts;
    const porcentagemProjecao = Math.round((projetado / meta) * 100);

    ctx.save();
    ctx.textAlign = 'center';

    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#3498db';
    ctx.fillText(`PROJEÇÃO`, width / 2, height / 2 - 30);
    
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`${porcentagemProjecao}%`, width / 2, height / 2 - 5);
    
    ctx.font = 'normal 24px Arial';
    ctx.fillStyle = '#888';
    ctx.fillText(label || 'REALIZADO', width / 2, height / 2 + 35);
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#3498db';
    ctx.fillText(`R$ ${realizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, width / 2, height / 2 + 55);

    ctx.restore();
  }
});

function renderizarGrafico(realizado, projetado) {
  const ctx = document.getElementById('chartRealizado').getContext('2d');

  const realizadoPercentual = Math.min(realizado / metaGeral, 1);
  const projetadoPercentual = projetado / metaGeral;

  const data = projetado >= metaGeral
    ? [100, 0, 0]
    : [
        realizadoPercentual * 100,
        Math.max(0, (projetadoPercentual - realizadoPercentual) * 100),
        Math.max(0, 100 - Math.min(projetadoPercentual, 1) * 100)
      ];

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Realizado', 'Projeção', 'Restante'],
      datasets: [{
        data,
        backgroundColor: ['#2ecc71', 'rgba(52, 152, 219, 0.5)', '#e5e5e5'],
        borderWidth: 0
      }]
    },
    options: {
      circumference: 180,
      rotation: 270,
      cutout: '80%',
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const label = ctx.label || '';
              const valor = ctx.raw;
              return `${label}: ${valor.toFixed(1)}%`;
            }
          }
        },
        centerText: {
          realizado,
          projetado,
          meta: metaGeral
        }
      }
    }
  });

  const gap = metaGeral - realizado;

  document.getElementById('grafico-gap').innerHTML =
    `GAP<br><span style="color: ${gap >= 0 ? '#c0392b' : '#27ae60'}; font-size: 16px;">R$ ${Math.abs(gap).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>`;

  document.getElementById('grafico-projecao').innerHTML =
    `PROJEÇÃO<br><span style="color: #2980b9; font-size: 16px;">R$ ${projetado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>`;
}

function renderizarGraficoArmer(notasFiltradas) {
  const apenasArmer = notasFiltradas.flatMap(nf => nf?.data?.itens || [])
    .filter(item => item?.codigo?.toUpperCase().includes('ARMER'));

  const ticketPorProduto = {};

  apenasArmer.forEach(item => {
    const codigo = item.codigo;
    if (!ticketPorProduto[codigo]) {
      ticketPorProduto[codigo] = { quantidade: 0, total: 0 };
    }
    ticketPorProduto[codigo].quantidade += item.quantidade || 0;
    ticketPorProduto[codigo].total += (item.quantidade || 0) * (item.valor || 0);
  });

  const realizado = Object.values(ticketPorProduto).reduce((sum, p) => sum + p.total, 0);
  const proporcao = hoje.getDate() / ultimoDiaDoMes;
  const projetado = realizado / proporcao;

  const ctx = document.getElementById('chartRealizadoArmer').getContext('2d');

  const realizadoPercentual = Math.min(realizado / metaArmer, 1);
  const projetadoPercentual = projetado / metaArmer;

  const data = projetado >= metaArmer
    ? [100, 0, 0]
    : [
        realizadoPercentual * 100,
        Math.max(0, (projetadoPercentual - realizadoPercentual) * 100),
        Math.max(0, 100 - Math.min(projetadoPercentual, 1) * 100)
      ];

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Realizado', 'Projeção', 'Restante'],
      datasets: [{
        data,
        backgroundColor: ['#2ecc71', 'rgba(52, 152, 219, 0.5)', '#e5e5e5'],
        borderWidth: 0
      }]
    },
    options: {
      circumference: 180,
      rotation: 270,
      cutout: '80%',
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const label = ctx.label || '';
              const valor = ctx.raw;
              return `${label}: ${valor.toFixed(1)}%`;
            }
          }
        },
        centerText: {
          realizado,
          projetado,
          meta: metaArmer
        }
      }
    }
  });

  document.getElementById('grafico-gap-armer').innerHTML =
    `GAP<br><span style="color: ${metaArmer - realizado >= 0 ? '#c0392b' : '#27ae60'}; font-size:16px;">R$ ${Math.abs(metaArmer - realizado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>`;

  document.getElementById('grafico-projecao-armer').innerHTML =
    `PROJEÇÃO<br><span style="color: #2980b9; font-size:16px;">R$ ${projetado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>`;

  const ranking = Object.entries(ticketPorProduto)
    .map(([codigo, dados]) => ({
      codigo,
      quantidade: dados.quantidade,
      total: dados.total
    }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const topMais = ranking.slice(0, 5);
  const topMenos = ranking.slice(-5);

  function renderTabelaArmer(lista, idTabela) {
    const tbody = document.querySelector(`#${idTabela} tbody`);
    tbody.innerHTML = '';
    lista.forEach(produto => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${produto.codigo}</td>
        <td>${produto.quantidade}</td>
        <td>R$ ${(produto.total / produto.quantidade).toFixed(2).replace('.', ',')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderTabelaArmer(topMais, 'tabela-mais-vendidos-armer');
  renderTabelaArmer(topMenos, 'tabela-menos-vendidos-armer');
}

function gerarTopProdutos(notas) {
  const produtos = {};

  notas.forEach(nf => {
    const itens = nf?.data?.itens || [];
    itens.forEach(item => {
      const nome = item.codigo;
      const qtd = item.quantidade || 0;
      const valor = item.valor || 0;

      if (!nome) return;

      if (!produtos[nome]) {
        produtos[nome] = { qtd: 0, total: 0 };
      }

      produtos[nome].qtd += qtd;
      produtos[nome].total += valor * qtd;
    });
  });

  const lista = Object.entries(produtos).map(([nome, dados]) => ({
    nome,
    qtd: dados.qtd,
    ticket: dados.total / dados.qtd
  }));

  const mais = [...lista].sort((a, b) => b.qtd - a.qtd).slice(0, 5);
  const menos = [...lista].sort((a, b) => a.qtd - b.qtd).slice(0, 5);

  function renderTabela(lista, idTabela) {
    const tbody = document.querySelector(`#${idTabela} tbody`);
    tbody.innerHTML = '';
    lista.forEach(produto => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${produto.nome}</td>
        <td>${produto.qtd}</td>
        <td>R$ ${produto.ticket.toFixed(2).replace('.', ',')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderTabela(mais, 'tabela-mais-vendidos');
  renderTabela(menos, 'tabela-menos-vendidos');
}

buscarNotas();

document.getElementById('botaoAtualizar')?.addEventListener('click', async () => {
  const botao = document.getElementById('botaoAtualizar');
  botao.disabled = true;
  botao.innerText = 'Atualizando...';

  try {
    const res = await fetch('http://localhost:3000/api/atualizar-notas');
    const json = await res.json();

    alert(json.mensagem || 'Atualização concluída!');
    location.reload(); // recarrega os dados e gráficos
  } catch (err) {
    console.error('Erro na atualização manual:', err);
    alert('Erro ao atualizar os dados. Veja o console para mais detalhes.');
  }

  botao.disabled = false;
  botao.innerText = 'Atualizar Dados';
});
